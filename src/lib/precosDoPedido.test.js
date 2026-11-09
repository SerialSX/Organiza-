// @vitest-environment jsdom
import { expect, it, vi, afterEach } from 'vitest';
import { precoDaEdicao, promocaoDasMetades } from './precosDoPedido';
import { itensDoCarrinho } from './itensDoCarrinho';
import { ajustarRelogio, agoraDoServidor } from './relogioServidor';
import { guardarNaFila, lerFila } from '../services/filaDeEnvio';
afterEach(()=>{vi.useRealTimers();localStorage.clear();ajustarRelogio(new Date().toISOString(),Date.now());});
it('DIN-01: envio online não envia horário de promoção',()=>{
  expect(itensDoCarrinho([{produtoId:'x',quantidade:2,promocao_em:'2000-01-01',promocaoEm:'2000-01-01'}])[0]).not.toHaveProperty('promocao_em');
});
it('DIN-01: fila usa o relógio do servidor quando o aparelho está cinco horas adiantado',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-08T23:00:00Z'));
  ajustarRelogio('Sun, 08 Nov 2026 18:00:00 GMT',Date.now());
  guardarNaFila('n',{chaveEnvio:'k',itens:[]});
  expect(lerFila('n')[0].guardadoEm).toBe('2026-11-08T18:00:00.000Z');
  expect(new Date(agoraDoServidor()).toISOString()).toBe('2026-11-08T18:00:00.000Z');
});
it('DIN-02: carrinho consome quantidade antiga uma vez e cobra excedente hoje',()=>{
  const lotes=[{quantidade:1,preco:5},{quantidade:2,preco:20}];
  expect(precoDaEdicao(4,lotes,30)).toEqual({totalLinha:75,quantidadeAntiga:3,excedente:1});
  expect(precoDaEdicao(1,lotes,30).totalLinha).toBe(30);
});
it('DIN-04: a promoção selecionada acompanha a regra e o desconto',()=>{
  const a={preco:70,normal:80,promocao:'Camarão'},b={preco:40,normal:40,promocao:null};
  expect(promocaoDasMetades('mais_caro',a,b)).toBe('Camarão');
  expect(promocaoDasMetades('media',b,a)).toBe('Camarão');
  expect(promocaoDasMetades('media',{...a,preco:79},{...b,preco:30,promocao:'Mussarela'})).toBe('Mussarela');
});
it('DIN-04: mais caro fica com a promoção da metade de preço normal maior, mesmo abaixo da outra',()=>{
  const camarao={preco:45,normal:80,promocao:'Semana do Camarão'},mussarela={preco:50,normal:50,promocao:null};
  expect(promocaoDasMetades('mais_caro',camarao,mussarela)).toBe('Semana do Camarão');
  expect(promocaoDasMetades('mais_caro',mussarela,camarao)).toBe('Semana do Camarão');
});
