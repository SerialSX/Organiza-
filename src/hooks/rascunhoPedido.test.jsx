// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {useRascunhoDoPedido} from './useRascunhoDoPedido';
it('TEL-03: reload durante envio conserva a chave junto com o rascunho',async()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();
  const host=document.createElement('div');let root=createRoot(host),estado;
  function Tela(){estado=useRascunhoDoPedido('n',false);return null;}
  await act(()=>root.render(<Tela/>));
  await act(()=>estado[1]([{produtoId:'x',quantidade:1}]));
  const chave=estado[3]();
  await act(()=>root.unmount());root=createRoot(host);
  await act(()=>root.render(<Tela/>));
  expect(estado[0]).toEqual([{produtoId:'x',quantidade:1}]);
  expect(estado[3]()).toBe(chave);
  estado[4]();
  expect(estado[3]()).not.toBe(chave);
  await act(()=>root.unmount());localStorage.clear();
});
it('pedido B depois do reload não reaproveita a chave do pedido A',async()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();
  const host=document.createElement('div');let root=createRoot(host),estado;
  function Tela(){estado=useRascunhoDoPedido('n',false);return null;}
  await act(()=>root.render(<Tela/>));
  await act(()=>estado[1]([{produtoId:'a',quantidade:1}]));
  const chaveDeA=estado[3]();
  // Recarregou no meio do envio de A (que já chegou ao banco).
  await act(()=>root.unmount());root=createRoot(host);
  await act(()=>root.render(<Tela/>));
  // Limpou e montou B: mexer no carrinho troca a chave, também no rascunho salvo.
  await act(()=>{estado[5]();estado[1]([{produtoId:'b',quantidade:1}]);});
  expect(JSON.parse(localStorage.getItem(Object.keys(localStorage)[0])).chaveEnvio).toBeNull();
  expect(estado[3]()).not.toBe(chaveDeA);
  await act(()=>root.unmount());localStorage.clear();
});
