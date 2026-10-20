// Testa a página pública (QR) contra supabase/schema.sql num Postgres local,
// como visitante sem conta (role anon) e como dono (authenticated).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

// Uso: npm run test:banco (ou node pagina-publica.mjs caminho/do/schema.sql)
process.on('unhandledRejection', (e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});

const schema = readFileSync(process.argv[2] ?? new URL('../schema.sql', import.meta.url), 'utf8').replace(/create extension if not exists pgcrypto;/, '');
const db = new PGlite();
let falhas = 0;

async function ok(nome, fn) {
  try {
    await fn();
    console.log('ok   ', nome);
  } catch (e) {
    falhas++;
    console.log('FALHA', nome, '->', e.message);
  }
}
async function erro(nome, esperado, fn) {
  try {
    await fn();
    falhas++;
    console.log('FALHA', nome, '-> deveria ter dado erro');
  } catch (e) {
    if (e.message.includes(esperado)) console.log('ok   ', nome, `(erro: ${e.message})`);
    else {
      falhas++;
      console.log('FALHA', nome, '-> erro diferente:', e.message);
    }
  }
}
function igual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
}

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated;
`);
await db.exec(schema);

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
await db.exec(`
  insert into auth.users values ('${U1}', 'a@a.com', '{"nome":"Ana","nome_negocio":"Lanche da Ana"}');
  insert into auth.users values ('${U2}', 'b@b.com', '{"nome":"Bia","nome_negocio":"Pastel da Bia"}');
`);

let ip = '200.1.1.1';
async function como(papel, usuario, sql, params) {
  await db.exec(`reset role;
    select set_config('request.jwt.claim.sub', '${usuario ?? ''}', false);
    select set_config('request.headers', '{"cf-connecting-ip": "${ip}"}', false);
    set role ${papel};`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}
const dono = (u, sql, p) => como('authenticated', u, sql, p);
const visitante = (sql, p) => como('anon', null, sql, p);
const pagina = async (codigo) => (await visitante('select public.pagina_publica($1) as r', [codigo]))[0].r;
const acompanhar = async (codigo, numero) =>
  (await visitante('select public.acompanhar_pedido($1, $2) as r', [codigo, numero]))[0].r;

const [{ codigo_publico: codigo1, id: negocio1 }] = await db.query(
  `select codigo_publico, n.id from public.negocios n join public.usuarios u on u.negocio_id = n.id where u.id = '${U1}'`,
).then((r) => r.rows);
const [{ codigo_publico: codigo2 }] = await db
  .query(`select codigo_publico from public.negocios n join public.usuarios u on u.negocio_id = n.id where u.id = '${U2}'`)
  .then((r) => r.rows);

const [{ id: xb }] = await dono(U1, `insert into public.produtos (negocio_id, nome, preco) values ($1, 'X', 10) returning id`, [negocio1]);
const novo = async (u, chave) =>
  (await dono(u, 'select * from public.criar_pedido($1::jsonb, $2::uuid)', [JSON.stringify([{ produto_id: xb, quantidade: 1 }]), chave]))[0];
const p1 = await novo(U1, 'aaaaaaaa-0000-4000-8000-000000000001');
const p2 = await novo(U1, 'aaaaaaaa-0000-4000-8000-000000000002');
const p3 = await novo(U1, 'aaaaaaaa-0000-4000-8000-000000000003');

await ok('código público tem 32 caracteres aleatórios', async () => {
  if (!/^[0-9a-f]{32}$/.test(codigo1)) throw new Error(codigo1);
  if (codigo1 === codigo2) throw new Error('códigos iguais');
});

await ok('visitante vê o nome do negócio', async () => igual(await pagina(codigo1), { nome: 'Lanche da Ana' }, 'página'));
await ok('endereço errado devolve nada', async () => igual(await pagina('naoexiste'), null, 'página'));

await ok('dono personaliza o nome', async () => {
  await dono(U1, `select public.configurar_pagina_publica('  Lanchonete da Ana  ', true)`);
  igual(await pagina(codigo1), { nome: 'Lanchonete da Ana' }, 'página');
});
await erro('nome com mais de 60 caracteres', 'no máximo 60', () =>
  dono(U1, `select public.configurar_pagina_publica($1, true)`, ['x'.repeat(61)]),
);

await ok('posição na fila', async () => {
  igual((await acompanhar(codigo1, p1.numero)).posicao, 1, 'primeiro');
  igual((await acompanhar(codigo1, p3.numero)).posicao, 3, 'terceiro');
});

await ok('pronto, tempo médio e fila andando', async () => {
  await db.query(`update public.pedidos set criado_em = now() - interval '12 minutes' where id = $1`, [p1.id]);
  await dono(U1, `select public.atualizar_status_pedido($1, 'pronto')`, [p1.id]);
  const r1 = await acompanhar(codigo1, p1.numero);
  igual([r1.status, r1.posicao, r1.tempo_medio_min], ['pronto', null, 12], 'pedido 1');
  igual((await acompanhar(codigo1, p3.numero)).posicao, 2, 'terceiro andou');
});

await ok('aviso de item que faltou', async () => {
  const [{ id: item }] = await db.query('select id from public.itens_pedido where pedido_id = $1', [p2.id]).then((r) => r.rows);
  await dono(U1, 'select public.marcar_item_faltou($1, true)', [item]);
  igual((await acompanhar(codigo1, p2.numero)).faltou, true, 'faltou');
});

await ok('cancelado aparece como cancelado', async () => {
  await dono(U1, `select public.cancelar_pedido($1, 'cliente_desistiu')`, [p2.id]);
  igual((await acompanhar(codigo1, p2.numero)).status, 'cancelado', 'status');
});

await ok('resposta não traz itens, valores nem nomes', async () => {
  igual(Object.keys(await acompanhar(codigo1, p3.numero)).sort(), ['encontrado', 'faltou', 'posicao', 'status', 'tempo_medio_min'], 'campos');
});

await ok('número de outro negócio não é encontrado', async () => {
  const [{ negocio_id: negocio2 }] = await dono(U2, 'select negocio_id from public.usuarios');
  const [{ id: pastel }] = await dono(U2, `insert into public.produtos (negocio_id, nome, preco) values ($1, 'P', 8) returning id`, [negocio2]);
  // O negócio 1 tem as senhas 1 a 3; a senha 5 só existe no negócio 2.
  let outro;
  for (let i = 1; i <= 5; i++) {
    [outro] = await dono(U2, 'select * from public.criar_pedido($1::jsonb, $2::uuid)', [
      JSON.stringify([{ produto_id: pastel, quantidade: 1 }]),
      `bbbbbbbb-0000-4000-8000-00000000000${i}`,
    ]);
  }
  igual(outro.numero, 5, 'senha do negócio 2');
  igual(await acompanhar(codigo1, 5), { encontrado: false }, 'outro negócio');
});

await ok('senha repetida no dia (depois do 999) mostra o pedido mais recente', async () => {
  ip = '200.6.6.6';
  // O pedido 1 do negócio 1 já está pronto; o contador vira e entrega o 1 de novo.
  await db.query(`update public.contador_pedidos set ultimo = 999 where negocio_id = $1`, [negocio1]);
  const repetido = await novo(U1, 'aaaaaaaa-0000-4000-8000-000000000099');
  igual(repetido.numero, 1, 'senha repetida');
  igual((await acompanhar(codigo1, 1)).status, 'pendente', 'mostra o mais recente');
});

await ok('pedido de ontem não é encontrado', async () => {
  await db.query('update public.pedidos set dia = dia - 1 where id = $1', [p3.id]);
  igual(await acompanhar(codigo1, p3.numero), { encontrado: false }, 'ontem');
});

await erro('visitante não lê tabelas', 'permission denied', () => visitante('select * from public.negocios'));
await erro('visitante não lê o controle de consultas', 'permission denied', () => visitante('select * from public.limite_consultas'));
await erro('visitante não configura a página', 'permission denied', () =>
  visitante(`select public.configurar_pagina_publica('x', false)`),
);
await erro('visitante não cria pedido', 'permission denied', () =>
  visitante(`select public.criar_pedido('[]'::jsonb, gen_random_uuid())`),
);

await erro('chutar números em sequência é barrado', 'Muitas consultas', async () => {
  ip = '200.9.9.9';
  for (let n = 900; n < 915; n++) await acompanhar(codigo1, n);
});
await ok('outro aparelho continua consultando', async () => {
  ip = '200.2.2.2';
  igual((await pagina(codigo1)).nome, 'Lanchonete da Ana', 'outro ip');
});
await erro('mais de 60 consultas no minuto é barrado', 'Muitas consultas', async () => {
  ip = '200.3.3.3';
  for (let n = 0; n < 61; n++) await pagina(codigo1);
});
await ok('IP não é guardado, só o hash', async () => {
  const r = await db.query(`select count(*)::int as n from public.limite_consultas where chave like '200.%'`);
  igual(r.rows[0].n, 0, 'ip em claro');
});

await ok('trocar o endereço invalida o QR antigo', async () => {
  ip = '200.4.4.4';
  const [{ novo: codigoNovo }] = await dono(U1, 'select public.trocar_codigo_publico() as novo');
  igual(await pagina(codigo1), null, 'antigo');
  igual((await pagina(codigoNovo)).nome, 'Lanchonete da Ana', 'novo');
});

await ok('página desligada some', async () => {
  ip = '200.5.5.5';
  await dono(U1, `select public.configurar_pagina_publica(null, false)`);
  const [{ codigo_publico }] = await dono(U1, 'select codigo_publico from public.negocios');
  igual(await pagina(codigo_publico), null, 'desligada');
});

await erro('atendente (não dono) não mexe na página', 'Só o dono', async () => {
  await db.query(`update public.usuarios set papel = 'atendente' where id = '${U2}'`);
  await dono(U2, 'select public.trocar_codigo_publico()');
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
