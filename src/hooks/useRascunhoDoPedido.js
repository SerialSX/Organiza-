import { useEffect, useState } from 'react';

// O pedido em montagem fica guardado neste aparelho: o atendente pode ir olhar
// a Cozinha ou recarregar a página sem perder o que já tinha tocado.
function chave(negocioId) {
  return `organiza-rascunho-pedido:${negocioId}`;
}

function ler(negocioId) {
  try {
    const salvo = JSON.parse(localStorage.getItem(chave(negocioId)));
    return Array.isArray(salvo) ? salvo : [];
  } catch {
    return [];
  }
}

// pausado: durante a edição de um pedido já enviado, o carrinho mostra esse
// pedido, e o rascunho guardado não pode ser sobrescrito.
export function useRascunhoDoPedido(negocioId, pausado) {
  const [carrinho, setCarrinho] = useState(() => ler(negocioId));

  useEffect(() => {
    if (pausado) return;
    try {
      if (carrinho.length) localStorage.setItem(chave(negocioId), JSON.stringify(carrinho));
      else localStorage.removeItem(chave(negocioId));
    } catch {
      // sem localStorage: o rascunho vale só enquanto a tela estiver aberta
    }
  }, [carrinho, negocioId, pausado]);

  return [carrinho, setCarrinho];
}

export function novaChaveDeLinha() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
