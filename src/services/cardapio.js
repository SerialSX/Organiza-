import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

// Exemplo do modo demonstração: a tela e os testes rodam sem IA.
const EXEMPLO = [
  { nome: 'X-Burguer', preco: 18.5 },
  { nome: 'Batata frita', preco: 12 },
  { nome: 'Suco de laranja', preco: null },
];

// Códigos que a Edge Function ler-cardapio devolve em { erro }. Qualquer outro
// vira a frase padrão: nada que venha do Google chega à tela.
const MENSAGENS = {
  nao_autenticado: 'Sua sessão expirou. Entre de novo para importar o cardápio.',
  imagem_grande: 'A foto ficou grande demais. Tente outra foto.',
  imagem_invalida: 'Não deu para abrir essa foto. Tente outra.',
  ia_ocupada: 'Muita gente usando a leitura agora. Tente de novo em alguns minutos.',
  ia_indisponivel: 'Não foi possível ler o cardápio agora. Tente de novo em instantes.',
};

// Devolve [{ nome, preco }], com preco null quando a foto não mostra o preço.
export async function lerCardapio(foto) {
  if (!isSupabaseConfigured) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return EXEMPLO;
  }

  const { data, error } = await supabase.functions.invoke('ler-cardapio', {
    body: foto,
    // Sem isto o supabase-js manda application/octet-stream.
    headers: { 'Content-Type': 'image/jpeg' },
    timeout: 45_000,
  });
  if (error) throw new Error(await mensagemDoErro(error));
  return data.itens;
}

// error.context é a resposta HTTP (da função ou do gateway) ou, sem resposta,
// o erro de rede.
export async function mensagemDoErro(error) {
  const resposta = error?.context;
  if (!(resposta instanceof Response)) return 'Sem conexão. Confira a internet e tente de novo.';
  if (resposta.status === 401) return MENSAGENS.nao_autenticado;
  const corpo = await resposta.json().catch(() => null);
  if (corpo?.erro === 'limite' && typeof corpo.mensagem === 'string') return corpo.mensagem;
  return Object.hasOwn(MENSAGENS, corpo?.erro) ? MENSAGENS[corpo.erro] : 'Não foi possível ler o cardápio. Tente de novo.';
}
