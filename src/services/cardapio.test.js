import { describe, expect, it } from 'vitest';
import { mensagemDoErro } from './cardapio';

const resposta = (corpo, status) => ({ context: new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status }) });

describe('mensagemDoErro', () => {
  it.each([
    ['limite do dia', resposta({ erro: 'limite', mensagem: 'Você já usou as 20 leituras de cardápio de hoje.' }, 429), 'Você já usou as 20 leituras de cardápio de hoje.'],
    ['código conhecido', resposta({ erro: 'imagem_grande' }, 413), 'A foto ficou grande demais. Tente outra foto.'],
    ['código desconhecido', resposta({ erro: 'toString' }, 500), 'Não foi possível ler o cardápio. Tente de novo.'],
    ['401 do gateway, sem JSON', resposta('Invalid JWT', 401), 'Sua sessão expirou. Entre de novo para importar o cardápio.'],
    ['corpo que não é JSON', resposta('<html>', 502), 'Não foi possível ler o cardápio. Tente de novo.'],
    ['falha de rede', { context: new TypeError('fetch failed') }, 'Sem conexão. Confira a internet e tente de novo.'],
  ])('%s', async (_, erro, esperado) => {
    expect(await mensagemDoErro(erro)).toBe(esperado);
  });
});
