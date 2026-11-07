// Pedidos que não saíram porque a internet caiu. Ficam guardados neste
// aparelho e são reenviados com a mesma chave de envio: se o primeiro envio
// chegou ao banco antes da queda, o reenvio devolve o mesmo pedido em vez de
// criar outro.
const prefixo = 'organiza-fila-envio-';

function chave(negocioId) {
  return `${prefixo}${negocioId}`;
}

export function lerFila(negocioId) {
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
  } catch {
    // sem localStorage: a fila vale enquanto a tela estiver aberta
  }
  window.dispatchEvent(new Event('organiza-fila-envio'));
}

// envio: { chaveEnvio, itens, mesa, identificacao, formaPagamento, resumo }
export function guardarNaFila(negocioId, envio) {
  const fila = lerFila(negocioId).filter((e) => e.chaveEnvio !== envio.chaveEnvio);
  gravar(negocioId, [...fila, { ...envio, guardadoEm: new Date().toISOString(), erro: null }]);
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
