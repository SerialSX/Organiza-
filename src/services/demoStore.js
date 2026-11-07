// Banco local usado quando o Supabase não está configurado. Serve para
// desenvolver e demonstrar as telas; os dados ficam só neste navegador.
import { emAberto } from '../lib/fimDoDia';

const CHAVE = 'organiza-demo-db';
const EVENTO = 'organiza-demo-change';

let memoria = null;

// Mesas da demonstração (o perfil salvo no navegador pode trocar).
export const MESAS_DEMO = { quantidade_mesas: 8, taxa_servico: 10 };

function vazio() {
  return {
    produtos: [],
    pedidos: [],
    itens_pedido: [],
    ingredientes: [],
    produto_ingredientes: [],
    contas_mesa: [],
    pagamentos_conta: [],
    dias_encerrados: [],
  };
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

// Como o gatilho reabrir_dia_do_pedido do banco: pedido em aberto num dia
// encerrado (lançado, desfeito, reaberto) desfaz o encerramento.
function semEncerramentoComPedidoAberto(db) {
  if (!db.dias_encerrados?.length) return db;
  const diasAbertos = new Set(db.pedidos.filter(emAberto).map((p) => p.dia));
  return { ...db, dias_encerrados: db.dias_encerrados.filter((d) => !diasAbertos.has(d.dia)) };
}

export function salvarDemo(novo) {
  const db = semEncerramentoComPedidoAberto(novo);
  memoria = db;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(db));
  } catch {
    // segue só em memória
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function limparDemo() {
  salvarDemo(vazio());
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
