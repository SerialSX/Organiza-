import { useEffect, useRef, useState } from 'react';
import { lerRascunho, gravarRascunho } from '../lib/rascunhoDoPedido';

export function novaChaveDeLinha() {
  return globalThis.crypto?.randomUUID?.() ?? Date.now()+'-'+Math.random().toString(16).slice(2);
}
// Na edição, o rascunho e a chave do próximo pedido ficam preservados.
export function useRascunhoDoPedido(negocioId, pausado) {
  const [inicial] = useState(()=>lerRascunho(negocioId));
  const [carrinho,setCarrinho] = useState(inicial.itens);
  const chaveEnvio = useRef(inicial.chaveEnvio);
  useEffect(()=>{
    if (!pausado) gravarRascunho(negocioId,carrinho,chaveEnvio.current);
  },[carrinho,negocioId,pausado]);
  function garantirChave() {
    chaveEnvio.current ??= novaChaveDeLinha();
    // Síncrono: um reload durante a RPC já encontra a mesma chave.
    gravarRascunho(negocioId,carrinho,chaveEnvio.current);
    return chaveEnvio.current;
  }
  // Mudou o conteúdo (itens ou destino), muda a chave: o próximo envio é outro
  // pedido, e não pode receber de volta o que já chegou ao banco.
  function trocarChave() {
    if (chaveEnvio.current === null) return;
    chaveEnvio.current=null;
    gravarRascunho(negocioId,carrinho,null);
  }
  function concluirEnvio() {
    chaveEnvio.current=null;
    gravarRascunho(negocioId,[],null);
  }
  return [carrinho,setCarrinho,chaveEnvio,garantirChave,concluirEnvio,trocarChave];
}
