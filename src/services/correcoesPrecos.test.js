// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { salvarDemo, lerDemo } from './demoStore';
import { criarPedido, editarPedido, buscarPedidoComValores } from './pedidos';
import { fecharContaMesa, listarContasDoDia } from './mesas';
import { calcularRelatorio } from './relatorios';
import { fecharCaixa } from '../lib/caixa';
const produto=(id,preco)=>({id,nome:id,preco,disponivel:true,arquivado:false,vai_para_cozinha:true,meio_a_meio:true});
beforeEach(()=>{localStorage.clear();salvarDemo({produtos:[produto('x',5),produto('y',40)],pedidos:[],itens_pedido:[]});});
const pedir=(itens,mesa=null)=>criarPedido({negocioId:'n',usuarioId:'u',chaveEnvio:crypto.randomUUID(),itens,mesa});
it('DIN-02/DIN-10: demo preserva quantidade, preço e aviso antigos, cobrando excedente atual',async()=>{
  const p=await pedir([{produto_id:'x',quantidade:1}]);
  const db=lerDemo();salvarDemo({...db,produtos:[produto('x',20)],itens_pedido:db.itens_pedido.map(i=>({...i,faltou:true,faltou_ingredientes:['Queijo']}))});
  await editarPedido(p.id,[{produto_id:'x',quantidade:3}],p.alterado_em);
  const q=await buscarPedidoComValores(p.id);
  expect(q.itens.map(i=>[i.quantidade,i.preco_unitario])).toEqual([[1,5],[2,20]]);
  expect(q.itens[0]).toMatchObject({faltou:true,faltou_ingredientes:['Queijo']});
  await editarPedido(p.id,[{produto_id:'x',quantidade:4}],q.alterado_em);
  expect((await buscarPedidoComValores(p.id)).itens.reduce((s,i)=>s+i.quantidade*i.preco_unitario,0)).toBe(65);
});
it('DIN-03: conta de ontem fica no caixa de ontem e bate com relatórios',async()=>{
  salvarDemo({...lerDemo(),produtos:[produto('x',20)]});
  const p=await pedir([{produto_id:'x',quantidade:4}],4);
  salvarDemo({...lerDemo(),pedidos:lerDemo().pedidos.map(p=>({...p,dia:'2020-01-01'}))});
  await fecharContaMesa([p.id],{jeito:'um_pagou',cobrarServico:false,pagamentos:[{forma:'pix',centavos:8000}]});
  const contas=await listarContasDoDia('2020-01-01'), pedido=await buscarPedidoComValores(p.id);
  expect(fecharCaixa([pedido],contas).recebido).toBe(80);
  expect(calcularRelatorio([pedido],lerDemo().produtos).faturamento).toBe(80);
  expect(await listarContasDoDia('2020-01-02')).toEqual([]);
});
it.each([['mais_caro',70,80],['media',55,60]])('DIN-04: demo %s calcula e grava a promoção da metade',async(regra,preco,cheio)=>{
  salvarDemo({...lerDemo(),perfil:{regra_meio_a_meio:regra},produtos:[produto('x',80),produto('y',40)],
    promocoes:[{id:'promo',nome:'Oferta',ativa:true,dias:[0,1,2,3,4,5,6],hora_inicio:null,hora_fim:null}],
    promocao_itens:[{promocao_id:'promo',produto_id:'x',preco:70}]});
  const p=await pedir([{produto_id:'x',segundo_produto_id:'y',quantidade:1}]);
  expect((await buscarPedidoComValores(p.id)).itens[0]).toMatchObject({preco_unitario:preco,preco_cheio:cheio,promocao:'Oferta'});
});
