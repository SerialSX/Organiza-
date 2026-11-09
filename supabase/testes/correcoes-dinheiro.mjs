import { randomUUID } from 'node:crypto';
import { prepararBanco, U1 } from './ajuda.mjs';
const { db, dono, negocioDe, ok, igual, terminar } = await prepararBanco(process.argv[2]);
const negocio = await negocioDe(U1);
const [{ id: produto }] = await dono(U1, `insert into public.produtos (negocio_id,nome,preco,custo,vai_para_cozinha) values ($1,'Lanche',20,8,true) returning id`, [negocio]);
const pedir = async (itens, mesa = null) => (await dono(U1, 'select * from public.criar_pedido($1::jsonb,$2,$3)', [JSON.stringify(itens),randomUUID(),mesa]))[0];
const editar = async (p,itens) => (await dono(U1,'select * from public.editar_pedido($1,$2::jsonb,$3)',[p.id,JSON.stringify(itens),p.alterado_em]))[0];
const itensDo = async (p) => (await db.query('select * from public.itens_pedido where pedido_id=$1 order by preco_unitario',[p.id])).rows;
const item = (quantidade=1, extra={}) => ({produto_id:produto,quantidade,...extra});

await ok('DIN-01: criação offline mantém a promoção de duas horas atrás; edição ignora cinco horas atrás', async () => {
  const [{ inicio, fim, atras2, atras5 }] = (await db.query(`select
    ((now() at time zone 'America/Fortaleza') - interval '6 hours')::time as inicio,
    ((now() at time zone 'America/Fortaleza') - interval '1 hour')::time as fim,
    (now() - interval '2 hours')::text as atras2, (now() - interval '5 hours')::text as atras5`)).rows;
  await dono(U1, 'select public.salvar_promocao(null,$1,$2::int[],$3::time,$4::time,$5::jsonb)', ['Ontem',[0,1,2,3,4,5,6],inicio,fim,JSON.stringify([{produto_id:produto,preco:5}])]);
  const offline = await pedir([item(1,{promocao_em:atras2})]);
  igual(Number((await itensDo(offline))[0].preco_unitario),5,'preço offline');
  const [{id:outro}] = await dono(U1, `insert into public.produtos (negocio_id,nome,preco,vai_para_cozinha) values ($1,'Outro',10,true) returning id`,[negocio]);
  const p = await pedir([{produto_id:outro,quantidade:1}]);
  await editar(p,[item(1,{promocao_em:atras5})]);
  igual(Number((await itensDo(p))[0].preco_unitario),20,'edição cobra agora');
  await dono(U1,'delete from public.promocoes');
});

await ok('DIN-02: excedente de produto custa hoje; reedição e chaves repetidas preservam o saldo', async () => {
  const [{id:promo}] = await dono(U1, `select public.salvar_promocao(null,'Oferta','{0,1,2,3,4,5,6}',null,null,$1::jsonb) as id`,[JSON.stringify([{produto_id:produto,preco:5}])]);
  let p = await pedir([item()]);
  await dono(U1,'update public.promocoes set ativa=false where id=$1',[promo]);
  p = await editar(p,[item(3)]);
  igual((await itensDo(p)).map(i=>[i.quantidade,Number(i.preco_unitario)]),[[1,5],[2,20]],'1 combinado, 2 atuais');
  await dono(U1,'update public.produtos set preco=30 where id=$1',[produto]);
  p = await editar(p,[item(2),item(2)]);
  const linhas = await itensDo(p);
  igual(linhas.reduce((s,i)=>s+i.quantidade*Number(i.preco_unitario),0),75,'saldo antigo não se repete');
  igual(linhas.filter(i=>Number(i.preco_unitario)===5).reduce((s,i)=>s+i.quantidade,0),1,'uma unidade promocional');
  await dono(U1,'update public.produtos set preco=20 where id=$1',[produto]);
  await dono(U1,'delete from public.promocoes where id=$1',[promo]);
});
await ok('DIN-02: excedente de combo usa preço atual e mantém lotes na reedição', async () => {
  const partes = [{opcoes:[{produto_id:produto}]},{opcoes:[{produto_id:produto}]}];
  const [{id:combo}] = await dono(U1,`select public.salvar_combo(null,'Duplo',30,$1::jsonb) as id`,[JSON.stringify(partes)]);
  const [{id:promo}] = await dono(U1, `select public.salvar_promocao(null,'Oferta combo','{0,1,2,3,4,5,6}',null,null,$1::jsonb) as id`,[JSON.stringify([{combo_id:combo,preco:5}])]);
  const c = q=>({combo_id:combo,quantidade:q,partes:[{produto_id:produto},{produto_id:produto}]});
  let p = await pedir([c(1)]);
  await dono(U1,'update public.promocoes set ativa=false where id=$1',[promo]);
  p = await editar(p,[c(3)]);
  igual((await itensDo(p)).reduce((s,i)=>s+i.quantidade*Number(i.preco_unitario),0),65,'1×5 + 2×30');
  p = await editar(p,[c(4)]);
  igual((await itensDo(p)).reduce((s,i)=>s+i.quantidade*Number(i.preco_unitario),0),95,'reedição conserva os lotes');
  await dono(U1,'delete from public.promocoes where id=$1',[promo]);
});

await ok('DIN-03: mesa de ontem recebida hoje pertence ao caixa de ontem', async () => {
  const p = await pedir([item(4)],4);
  await db.query("update public.pedidos set dia=public.dia_do_negocio(negocio_id)-1 where id=$1",[p.id]);
  const [{id}] = await dono(U1,"select public.fechar_conta_mesa($1::uuid[],'um_pagou',false,'[{\"forma\":\"pix\",\"valor\":80}]') as id",[[p.id]]);
  const [c] = (await db.query('select c.consumo::float as consumo,c.dia=p.dia as mesmo_dia,c.dia<public.dia_do_negocio(c.negocio_id) as ontem from public.contas_mesa c join public.pedidos p on p.conta_id=c.id where c.id=$1',[id])).rows;
  igual(c,{consumo:80,mesmo_dia:true,ontem:true},'conta no dia do pedido');
});
await ok('DIN-04: meio a meio registra a promoção que determina o preço', async () => {
  const [{id:a},{id:b}] = await dono(U1,"insert into public.produtos(negocio_id,nome,preco,meio_a_meio) values ($1,'Camarão',80,true),($1,'Mussarela',40,true) returning id",[negocio]);
  const [{id:promo}] = await dono(U1,"select public.salvar_promocao(null,'Pizza oferta','{0,1,2,3,4,5,6}',null,null,$1::jsonb) as id",[JSON.stringify([{produto_id:a,preco:70}])]);
  for (const [regra,preco,cheio] of [['mais_caro',70,80],['media',55,60]]) {
    await dono(U1,'select public.configurar_meio_a_meio($1)',[regra]);
    for (const [primeiro,segundo] of [[a,b],[b,a]]) {
      const p = await pedir([{produto_id:primeiro,segundo_produto_id:segundo,quantidade:1}]);
      const [i] = await itensDo(p);
      igual([Number(i.preco_unitario),Number(i.preco_cheio),i.promocao_id],[preco,cheio,promo],regra);
    }
  }
  await dono(U1,'delete from public.promocoes where id=$1',[promo]);
});
await ok('DIN-10: editar quantidade conserva faltou e ingredientes dos itens existentes', async () => {
  const p=await pedir([item()]);
  await db.query("update public.itens_pedido set faltou=true,faltou_ingredientes='{Queijo}' where pedido_id=$1",[p.id]);
  await editar(p,[item(2)]);
  const linhas=await itensDo(p);
  igual(linhas.some(i=>i.faltou && i.faltou_ingredientes.includes('Queijo')),true,'aviso preservado');
});
terminar();
await db.close();
