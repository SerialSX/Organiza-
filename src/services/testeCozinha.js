// "Testar agora" do guia da cozinha: manda um aviso para o aparelho da
// cozinha sem criar pedido. A tela da Cozinha mostra "Teste recebido", toca o
// som e responde; quem mandou fica sabendo que chegou.
// Supabase: canal de broadcast do Realtime (não grava nada no banco).
// Demonstração: BroadcastChannel entre abas do mesmo navegador.
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const ESPERA_MS = 10000;
const CANAL_DEMO = 'organiza-teste-cozinha';

function nomeDoCanal(negocioId) {
  return `teste-cozinha-${negocioId}`;
}

function novoIdDeTeste() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Resolve true quando a cozinha respondeu, false se não respondeu a tempo.
export function enviarTesteParaCozinha(negocioId, esperaMs = ESPERA_MS) {
  const id = novoIdDeTeste();

  if (!isSupabaseConfigured) {
    if (typeof BroadcastChannel === 'undefined') return Promise.resolve(false);
    return new Promise((resolve) => {
      const canal = new BroadcastChannel(CANAL_DEMO);
      const fim = (ok) => {
        clearTimeout(tempo);
        canal.close();
        resolve(ok);
      };
      const tempo = setTimeout(() => fim(false), esperaMs);
      canal.onmessage = (e) => {
        if (e.data?.tipo === 'teste-ok' && e.data.id === id) fim(true);
      };
      canal.postMessage({ tipo: 'teste', id });
    });
  }

  return new Promise((resolve) => {
    const canal = supabase.channel(nomeDoCanal(negocioId), { config: { broadcast: { self: false } } });
    let terminou = false;
    const fim = (ok) => {
      if (terminou) return;
      terminou = true;
      clearTimeout(tempo);
      supabase.removeChannel(canal);
      resolve(ok);
    };
    const tempo = setTimeout(() => fim(false), esperaMs);
    canal
      .on('broadcast', { event: 'teste-ok' }, ({ payload }) => {
        if (payload?.id === id) fim(true);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') canal.send({ type: 'broadcast', event: 'teste', payload: { id } });
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') fim(false);
      });
  });
}

// Usado pela tela da Cozinha. Devolve a função que para de ouvir.
export function ouvirTesteDaCozinha(negocioId, aoReceber) {
  if (!isSupabaseConfigured) {
    if (typeof BroadcastChannel === 'undefined') return () => {};
    const canal = new BroadcastChannel(CANAL_DEMO);
    canal.onmessage = (e) => {
      if (e.data?.tipo !== 'teste') return;
      aoReceber();
      canal.postMessage({ tipo: 'teste-ok', id: e.data.id });
    };
    return () => canal.close();
  }

  const canal = supabase
    .channel(nomeDoCanal(negocioId), { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'teste' }, ({ payload }) => {
      aoReceber();
      canal.send({ type: 'broadcast', event: 'teste-ok', payload: { id: payload?.id } });
    })
    .subscribe();
  return () => supabase.removeChannel(canal);
}
