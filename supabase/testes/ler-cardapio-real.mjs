// Teste real da Edge Function ler-cardapio contra o projeto no ar. Não roda no
// CI: precisa de uma conta de teste e de uma foto JPEG. Gasta uma leitura do dia.
// Uso (Git Bash, na raiz do projeto):
//   export $(grep -v '^#' .env.local | xargs)
//   TESTE_EMAIL=... TESTE_SENHA=... node supabase/testes/ler-cardapio-real.mjs caminho/da/foto.jpg
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: chave, TESTE_EMAIL, TESTE_SENHA } = process.env;
const foto = process.argv[2];
if (!url || !chave || !TESTE_EMAIL || !TESTE_SENHA || !foto) {
  console.error('Faltou variável ou o caminho da foto (veja o cabeçalho do arquivo).');
  process.exit(1);
}

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const semLogin = createClient(url, chave, opcoes);
const logado = createClient(url, chave, opcoes);
let falhas = 0;

async function caso(nome, esperado, cliente, corpo) {
  const { data, error } = await cliente.functions.invoke('ler-cardapio', { body: corpo, headers: { 'Content-Type': 'image/jpeg' } });
  // Erro da função ou do gateway traz a resposta HTTP em error.context.
  const status = error?.context?.status ?? (error ? 'rede' : 200);
  const resposta = error?.context?.json ? await error.context.json().catch(() => null) : data;
  if (status !== esperado) falhas++;
  console.log(status === esperado ? 'ok   ' : 'FALHA', nome, '->', status, JSON.stringify(resposta)?.slice(0, 300));
  return resposta;
}

await caso('sem login', 401, semLogin, new Blob(['x']));
const { error: erroLogin } = await logado.auth.signInWithPassword({ email: TESTE_EMAIL, password: TESTE_SENHA });
if (erroLogin) {
  console.error('Login falhou:', erroLogin.message);
  process.exit(1);
}
await caso('arquivo que não é JPEG', 415, logado, new Blob(['isto não é uma foto']));
await caso('maior que 4 MB', 413, logado, new Blob([new Uint8Array(5 * 1024 * 1024)]));
const lida = await caso('foto real', 200, logado, new Blob([readFileSync(foto)]));
console.table(lida?.itens ?? []);

if (falhas) process.exit(1);
console.log('\nTudo certo');
