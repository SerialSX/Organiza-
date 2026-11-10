let diferenca = 0;
try { diferenca = Number(localStorage.getItem('organiza-relogio-servidor')) || 0; } catch { /* sem armazenamento */ }

export function ajustarRelogio(data, inicio, fim = Date.now()) {
  const servidor = Date.parse(data ?? '');
  if (!Number.isFinite(servidor)) return;
  diferenca = servidor - (inicio + fim) / 2;
  try { localStorage.setItem('organiza-relogio-servidor', String(diferenca)); } catch { /* vale nesta sessão */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('organiza-relogio'));
}
export function agoraDoServidor() { return Date.now() + diferenca; }
export async function fetchComRelogio(...args) {
  const inicio=Date.now();
  const resposta=await fetch(...args);
  ajustarRelogio(resposta.headers.get('Date'),inicio);
  return resposta;
}
