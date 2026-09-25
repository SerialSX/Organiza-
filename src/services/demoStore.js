// Banco local usado quando o Supabase não está configurado. Serve para
// desenvolver e demonstrar as telas; os dados ficam só neste navegador.
const CHAVE = 'organiza-demo-db';
const EVENTO = 'organiza-demo-change';

let memoria = null;

function vazio() {
  return { produtos: [], pedidos: [], itens_pedido: [] };
}

export function lerDemo() {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo) return { ...vazio(), ...JSON.parse(salvo) };
  } catch {
    // localStorage indisponível: usa a cópia em memória
  }
  return memoria ?? vazio();
}

export function salvarDemo(db) {
  memoria = db;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(db));
  } catch {
    // segue só em memória
  }
  window.dispatchEvent(new Event(EVENTO));
}

// Avisa mudanças feitas nesta aba e em outras abas do mesmo navegador,
// o que permite testar Pedidos e Cozinha lado a lado.
export function assinarDemo(callback) {
  const aoMudarStorage = (e) => {
    if (e.key === CHAVE) callback();
  };
  window.addEventListener(EVENTO, callback);
  window.addEventListener('storage', aoMudarStorage);
  return () => {
    window.removeEventListener(EVENTO, callback);
    window.removeEventListener('storage', aoMudarStorage);
  };
}

export function novoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
