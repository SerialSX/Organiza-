// Pedidos que não saíram porque a internet caiu. Ficam guardados neste
// aparelho e são reenviados com a mesma chave de envio: se o primeiro envio
// chegou ao banco antes da queda, o reenvio devolve o mesmo pedido em vez de
// criar outro.
import { agoraDoServidor } from '../lib/relogioServidor';
const prefixo = 'organiza-fila-envio-';

function chave(negocioId) {
  return `${prefixo}${negocioId}`;
}

// Cópia em memória usada quando o localStorage falha (cheio ou bloqueado):
// sem ela o pedido sumia da fila enquanto a tela dizia que foi guardado.
const memoria = new Map();

export function lerFila(negocioId) {
  if (memoria.has(negocioId)) return memoria.get(negocioId);
  try {
    const salvo = JSON.parse(localStorage.getItem(chave(negocioId)));
    return Array.isArray(salvo) ? salvo : [];
  } catch {
    return [];
  }
}

function gravar(negocioId, fila) {
  try {
    if (fila.length) localStorage.setItem(chave(negocioId), JSON.stringify(fila));
    else localStorage.removeItem(chave(negocioId));
    memoria.delete(negocioId);
  } catch {
    // sem localStorage: a fila vale enquanto a tela estiver aberta
    memoria.set(negocioId, fila);
  }
  window.dispatchEvent(new Event('organiza-fila-envio'));
}

// envio: { chaveEnvio, itens, mesa, nomeMesa, identificacao, formaPagamento, resumo }
export function guardarNaFila(negocioId, envio) {
  const fila = lerFila(negocioId).filter((e) => e.chaveEnvio !== envio.chaveEnvio);
  gravar(negocioId, [...fila, { ...envio, guardadoEm: new Date(agoraDoServidor()).toISOString(), erro: null }]);
}

export function tirarDaFila(negocioId, chaveEnvio) {
  gravar(
    negocioId,
    lerFila(negocioId).filter((e) => e.chaveEnvio !== chaveEnvio),
  );
}

// O banco recusou (ex.: um produto esgotou): o pedido para de ser reenviado
// e espera o atendente decidir.
export function marcarErroNaFila(negocioId, chaveEnvio, erro) {
  gravar(
    negocioId,
    lerFila(negocioId).map((e) => (e.chaveEnvio === chaveEnvio ? { ...e, erro } : e)),
  );
}

export function assinarFila(callback) {
  const aoMudarStorage = (e) => {
    if (e.key?.startsWith(prefixo)) callback();
  };
  window.addEventListener('organiza-fila-envio', callback);
  window.addEventListener('storage', aoMudarStorage);
  return () => {
    window.removeEventListener('organiza-fila-envio', callback);
    window.removeEventListener('storage', aoMudarStorage);
  };
}

// Pedidos guardados sem internet que já saíram: "Pedido de 1× X-burguer
// agora é o 014". Ficam até o atendente tocar em "Ok", em qualquer tela (a
// tela de Pedidos mostra o número grande e tira daqui).
const prefixoSaidas = 'organiza-fila-saidas-';
const EVENTO_SAIDAS = 'organiza-fila-saidas';

export function lerSaidas(negocioId) {
  try {
    const salvo = JSON.parse(localStorage.getItem(`${prefixoSaidas}${negocioId}`));
    return Array.isArray(salvo) ? salvo : [];
  } catch {
    return [];
  }
}

function gravarSaidas(negocioId, saidas) {
  try {
    if (saidas.length) localStorage.setItem(`${prefixoSaidas}${negocioId}`, JSON.stringify(saidas));
    else localStorage.removeItem(`${prefixoSaidas}${negocioId}`);
  } catch {
    // sem localStorage: o aviso some ao trocar de tela
  }
  window.dispatchEvent(new Event(EVENTO_SAIDAS));
}

// saida: { chaveEnvio, numero, resumo, mesa, nomeMesa, identificacao }
export function registrarSaida(negocioId, saida) {
  gravarSaidas(negocioId, [...lerSaidas(negocioId).filter((s) => s.chaveEnvio !== saida.chaveEnvio), saida]);
}

export function dispensarSaida(negocioId, chaveEnvio) {
  gravarSaidas(
    negocioId,
    lerSaidas(negocioId).filter((s) => s.chaveEnvio !== chaveEnvio),
  );
}

export function assinarSaidas(callback) {
  const aoMudarStorage = (e) => {
    if (e.key?.startsWith(prefixoSaidas)) callback();
  };
  window.addEventListener(EVENTO_SAIDAS, callback);
  window.addEventListener('storage', aoMudarStorage);
  return () => {
    window.removeEventListener(EVENTO_SAIDAS, callback);
    window.removeEventListener('storage', aoMudarStorage);
  };
}
