// Roda supabase/schema.sql num Postgres local (PGlite) com um Supabase "de mentira"
// (schema auth, roles anon/authenticated) e testa as regras do fluxo do pedido.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

// Uso: npm run test:banco (ou node fluxo-do-pedido.mjs caminho/do/schema.sql)
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
console.log('schema aplicado');

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
await db.exec(`
  insert into auth.users values ('${U1}', 'a@a.com', '{"nome":"Ana","nome_negocio":"Lanche da Ana"}');
  insert into auth.users values ('${U2}', 'b@b.com', '{"nome":"Bia","nome_negocio":"Pastel da Bia"}');
`);

async function como(usuario, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${usuario}', false); set role authenticated;`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}
const rpc = (u, fn, args) => como(u, `select * from public.${fn}`, args);

let negocio1, xb, batata, refri, pedido;

await ok('trigger de cadastro cria negócio e admin', async () => {
  const r = await como(U1, 'select negocio_id, papel from public.usuarios');
  igual(r.length, 1, 'usuários visíveis');
  igual(r[0].papel, 'admin', 'papel');
  negocio1 = r[0].negocio_id;
});

await ok('cadastra produtos', async () => {
  const r = await como(
    U1,
    `insert into public.produtos (negocio_id, nome, preco, custo) values
      ($1, 'X-Burguer', 18.5, 9), ($1, 'Batata', 15, 6), ($1, 'Refri', 6, null) returning id, nome`,
    [negocio1],
  );
  [xb, batata, refri] = r.map((p) => p.id);
});

const K1 = 'aaaaaaaa-0000-4000-8000-000000000001';
await ok('primeiro pedido do dia recebe a senha 1', async () => {
  const r = await rpc(U1, 'criar_pedido($1::jsonb, $2::uuid)', [
    JSON.stringify([
      { produto_id: xb, quantidade: 2, observacao: '  sem salada ' },
      { produto_id: batata, quantidade: 1 },
    ]),
    K1,
  ]);
  pedido = r[0];
  igual(pedido.numero, 1, 'senha');
  const itens = await como(U1, 'select observacao, preco_unitario from public.itens_pedido where pedido_id = $1 order by preco_unitario desc', [pedido.id]);
  igual(itens.map((i) => i.observacao), ['sem salada', null], 'observações');
});

await ok('mesmo envio repetido não duplica', async () => {
  const r = await rpc(U1, 'criar_pedido($1::jsonb, $2::uuid)', [JSON.stringify([{ produto_id: refri, quantidade: 1 }]), K1]);
  igual(r[0].id, pedido.id, 'mesmo pedido');
  const total = await como(U1, 'select count(*)::int as n from public.pedidos');
  igual(total[0].n, 1, 'pedidos');
});

await erro('observação acima de 140 caracteres', 'no máximo 140', () =>
  rpc(U1, 'criar_pedido($1::jsonb, $2::uuid)', [
    JSON.stringify([{ produto_id: xb, quantidade: 1, observacao: 'x'.repeat(141) }]),
    'aaaaaaaa-0000-4000-8000-000000000002',
  ]),
);
await erro('observação que não é texto', 'inválido', () =>
  rpc(U1, 'criar_pedido($1::jsonb, $2::uuid)', [
    JSON.stringify([{ produto_id: xb, quantidade: 1, observacao: 5 }]),
    'aaaaaaaa-0000-4000-8000-000000000003',
  ]),
);
await erro('cliente não escreve direto na tabela', 'permission denied', () =>
  como(U1, `update public.pedidos set status = 'entregue'`),
);

await ok('editar: preço antigo mantido e produto esgotado que já estava continua', async () => {
  await como(U1, 'update public.produtos set preco = 99, disponivel = false where id = $1', [xb]);
  await rpc(U1, 'editar_pedido($1::uuid, $2::jsonb, (select alterado_em from public.pedidos where id = $1::uuid))', [
    pedido.id,
    JSON.stringify([
      { produto_id: xb, quantidade: 3 },
      { produto_id: refri, quantidade: 1, observacao: 'gelado' },
    ]),
  ]);
  const itens = await como(U1, 'select produto_id, quantidade, preco_unitario::float as p from public.itens_pedido where pedido_id = $1 order by p desc', [pedido.id]);
  igual(itens.map((i) => [i.quantidade, i.p]), [[3, 18.5], [1, 6]], 'itens editados');
  const p = await como(U1, 'select alterado_em is not null as alterado from public.pedidos where id = $1', [pedido.id]);
  igual(p[0].alterado, true, 'alterado_em');
});

await erro('editar não aceita produto esgotado novo', 'esgotou', async () => {
  await como(U1, 'update public.produtos set disponivel = false where id = $1', [batata]);
  await rpc(U1, 'editar_pedido($1::uuid, $2::jsonb, (select alterado_em from public.pedidos where id = $1::uuid))', [pedido.id, JSON.stringify([{ produto_id: batata, quantidade: 1 }])]);
});
await como(U1, 'update public.produtos set disponivel = true where id in ($1, $2)', [xb, batata]);

await erro('outro negócio não enxerga nem mexe no pedido', 'não encontrado', () =>
  rpc(U2, 'cancelar_pedido($1::uuid, $2)', [pedido.id, 'outro']),
);
await ok('outro negócio não lista pedidos alheios', async () => {
  const r = await como(U2, 'select count(*)::int as n from public.pedidos');
  igual(r[0].n, 0, 'pedidos visíveis');
});

let itemId;
await ok('cozinha marca item que faltou', async () => {
  itemId = (await como(U1, 'select id from public.itens_pedido where pedido_id = $1 limit 1', [pedido.id]))[0].id;
  await rpc(U1, 'marcar_item_faltou($1::uuid, $2)', [itemId, true]);
  const r = await como(U1, 'select faltou from public.itens_pedido where id = $1', [itemId]);
  igual(r[0].faltou, true, 'faltou');
});

await ok('pronto e desfazer dentro de 2 minutos', async () => {
  await rpc(U1, 'atualizar_status_pedido($1::uuid, $2)', [pedido.id, 'pronto']);
  await rpc(U1, 'atualizar_status_pedido($1::uuid, $2)', [pedido.id, 'pendente']);
  const r = await como(U1, 'select status, pronto_em from public.pedidos where id = $1', [pedido.id]);
  igual([r[0].status, r[0].pronto_em], ['pendente', null], 'voltou para a fila');
});

await erro('desfazer depois de 2 minutos', 'tempo para desfazer', async () => {
  await rpc(U1, 'atualizar_status_pedido($1::uuid, $2)', [pedido.id, 'pronto']);
  await db.query(`update public.pedidos set pronto_em = now() - interval '3 minutes' where id = $1`, [pedido.id]);
  await rpc(U1, 'atualizar_status_pedido($1::uuid, $2)', [pedido.id, 'pendente']);
});

await erro('editar pedido pronto', 'Lance um pedido novo', () =>
  rpc(U1, 'editar_pedido($1::uuid, $2::jsonb, (select alterado_em from public.pedidos where id = $1::uuid))', [pedido.id, JSON.stringify([{ produto_id: xb, quantidade: 1 }])]),
);

await erro('cancelar sem motivo válido', 'motivo', () => rpc(U1, 'cancelar_pedido($1::uuid, $2)', [pedido.id, 'qualquer']));
await ok('cancelar pedido pronto', async () => {
  await rpc(U1, 'cancelar_pedido($1::uuid, $2)', [pedido.id, 'cliente_desistiu']);
  const r = await como(U1, 'select status, motivo_cancelamento from public.pedidos where id = $1', [pedido.id]);
  igual([r[0].status, r[0].motivo_cancelamento], ['cancelado', 'cliente_desistiu'], 'cancelado');
});
await erro('cancelar de novo', 'encerrado', () => rpc(U1, 'cancelar_pedido($1::uuid, $2)', [pedido.id, 'outro']));
await erro('mudar status de cancelado', 'mudou de status', () =>
  rpc(U1, 'atualizar_status_pedido($1::uuid, $2)', [pedido.id, 'pronto']),
);

await ok('pendência de ontem pode ser resolvida como entregue', async () => {
  const p = (
    await rpc(U1, 'criar_pedido($1::jsonb, $2::uuid)', [
      JSON.stringify([{ produto_id: batata, quantidade: 1 }]),
      'aaaaaaaa-0000-4000-8000-000000000009',
    ])
  )[0];
  await db.query(`update public.pedidos set dia = dia - 1 where id = $1`, [p.id]);
  await rpc(U1, 'atualizar_status_pedido($1::uuid, $2)', [p.id, 'entregue']);
});
await erro('pedido de hoje não pula direto para entregue', 'mudou de status', async () => {
  const p = (
    await rpc(U1, 'criar_pedido($1::jsonb, $2::uuid)', [
      JSON.stringify([{ produto_id: batata, quantidade: 1 }]),
      'aaaaaaaa-0000-4000-8000-000000000010',
    ])
  )[0];
  await rpc(U1, 'atualizar_status_pedido($1::uuid, $2)', [p.id, 'entregue']);
});

const novaSenha = async () =>
  (await rpc(U1, 'criar_pedido($1::jsonb, gen_random_uuid())', [JSON.stringify([{ produto_id: refri, quantidade: 1 }])]))[0].numero;

await ok('senhas seguem em sequência, sem repetir', async () => {
  const antes = await novaSenha();
  const senhas = [];
  for (let i = 0; i < 5; i++) senhas.push(await novaSenha());
  igual(senhas, [1, 2, 3, 4, 5].map((n) => antes + n), 'sequência');
});

await ok('depois do 999 a senha volta para 1', async () => {
  await db.query('update public.contador_pedidos set ultimo = 998');
  igual([await novaSenha(), await novaSenha()], [999, 1], 'virada');
});

await ok('no dia seguinte a senha recomeça em 1', async () => {
  await db.query('update public.contador_pedidos set dia = dia - 1, ultimo = 57');
  igual(await novaSenha(), 1, 'recomeço');
});

const umRefri = JSON.stringify([{ produto_id: refri, quantidade: 1 }]);

await ok('pedido na mesa guarda a mesa; sem mesa é balcão', async () => {
  const naMesa = (await rpc(U1, 'criar_pedido($1::jsonb, gen_random_uuid(), $2::int)', [umRefri, 12]))[0];
  const noBalcao = (await rpc(U1, 'criar_pedido($1::jsonb, gen_random_uuid())', [umRefri]))[0];
  igual([naMesa.mesa, noBalcao.mesa], [12, null], 'mesas');
  igual(noBalcao.numero, naMesa.numero + 1, 'mesa e balcão dividem a mesma sequência de senhas');
});

await erro('mesa fora de 1 a 999', 'entre 1 e 999', () =>
  rpc(U1, 'criar_pedido($1::jsonb, gen_random_uuid(), $2::int)', [umRefri, 1000]),
);

await ok('editar troca a mesa ou passa para o balcão', async () => {
  const p = (await rpc(U1, 'criar_pedido($1::jsonb, gen_random_uuid())', [umRefri]))[0];
  const versao = '(select alterado_em from public.pedidos where id = $1::uuid)';
  const naMesa = (await rpc(U1, `editar_pedido($1::uuid, $2::jsonb, ${versao}, $3::int)`, [p.id, umRefri, 7]))[0];
  igual(naMesa.mesa, 7, 'mesa nova');
  const noBalcao = (await rpc(U1, `editar_pedido($1::uuid, $2::jsonb, ${versao})`, [p.id, umRefri]))[0];
  igual(noBalcao.mesa, null, 'balcão');
});

await erro('cliente não lê nem mexe no contador de senhas', 'permission denied', () =>
  como(U1, 'update public.contador_pedidos set ultimo = 1'),
);

await erro('anônimo não lê pedidos', 'permission denied', async () => {
  await db.exec(`reset role; set role anon;`);
  try {
    await db.query('select * from public.pedidos');
  } finally {
    await db.exec('reset role;');
  }
});

await erro('edição com versão antiga é recusada (duas pessoas editando)', 'Outra pessoa alterou', async () => {
  const p = (
    await rpc(U1, 'criar_pedido($1::jsonb, $2::uuid)', [
      JSON.stringify([{ produto_id: batata, quantidade: 1 }]),
      'aaaaaaaa-0000-4000-8000-000000000077',
    ])
  )[0];
  const editar = (versao) =>
    rpc(U1, 'editar_pedido($1::uuid, $2::jsonb, $3::timestamptz)', [p.id, JSON.stringify([{ produto_id: batata, quantidade: 2 }]), versao]);
  await editar(null); // primeira pessoa: versão que ela abriu (nunca editado)
  await editar(null); // segunda pessoa abriu antes da primeira salvar
});

await ok('minha conta: nome da pessoa e do negócio', async () => {
  await rpc(U1, 'atualizar_meus_dados($1, $2)', ['  Ana Paula ', ' Lanche da Ana Paula ']);
  const r = await como(U1, 'select u.nome, n.nome as negocio from public.usuarios u join public.negocios n on n.id = u.negocio_id');
  igual([r[0].nome, r[0].negocio], ['Ana Paula', 'Lanche da Ana Paula'], 'nomes');
});
await erro('minha conta: nome vazio', 'Digite seu nome', () => rpc(U1, 'atualizar_meus_dados($1, $2)', ['   ', null]));
await erro('minha conta: quem não é dono não renomeia o negócio', 'Só o dono', async () => {
  await db.query(`update public.usuarios set papel = 'atendente' where id = '${U2}'`);
  try {
    await rpc(U2, 'atualizar_meus_dados($1, $2)', ['Bia', 'Outro nome']);
  } finally {
    await db.query(`update public.usuarios set papel = 'admin' where id = '${U2}'`);
  }
});
await ok('excluir conta apaga o usuário e o negócio dele, sem tocar no dos outros', async () => {
  await rpc(U2, 'excluir_minha_conta()');
  const r = await db.query(`select
    (select count(*) from auth.users where id = '${U2}')::int as usuario,
    (select count(*) from public.negocios)::int as negocios,
    (select count(*) from auth.users where id = '${U1}')::int as outro`);
  igual([r.rows[0].usuario, r.rows[0].negocios, r.rows[0].outro], [0, 1, 1], 'restou');
});
await erro('visitante não exclui conta', 'permission denied', async () => {
  await db.exec('reset role; set role anon;');
  try {
    await db.query('select public.excluir_minha_conta()');
  } finally {
    await db.exec('reset role;');
  }
});

await ok('apagar o negócio apaga tudo em cascata (LGPD)', async () => {
  await db.query('delete from public.negocios where id = $1', [negocio1]);
  const r = await db.query('select (select count(*) from public.pedidos)::int as p, (select count(*) from public.itens_pedido)::int as i');
  igual([r.rows[0].p, r.rows[0].i], [0, 0], 'restou dado');
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
