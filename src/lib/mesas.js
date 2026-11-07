// Mapa das mesas, mesa extra, taxa de serviço e divisão da conta. As contas
// em centavos (inteiros), como no banco (numeric com 2 casas), para a soma
// das partes bater certinho com o total.
import { totalDoPedido } from './caixa';

export const MESAS_PADRAO = 8;
export const MAXIMO_DE_MESAS = 200;
export const TAXA_PADRAO = 10;
export const MAXIMO_DA_TAXA = 30;
export const LIMITE_NOME_MESA = 20;
// Mesa extra ganha um número acima das mesas do mapa (o banco aceita até 999).
const ULTIMA_MESA = 999;

export function limparNomeMesa(texto) {
  const limpo = (texto ?? '').trim().replace(/\s+/g, ' ');
  return limpo ? limpo.slice(0, LIMITE_NOME_MESA) : null;
}

// "Mesa 4" ou o nome da mesa extra ("Varanda").
export function nomeDaMesa({ mesa, nome_mesa: nome }) {
  return nome || `Mesa ${mesa}`;
}

export function emCentavos(valor) {
  return Math.round(Number(valor) * 100);
}

export function emReais(centavos) {
  return centavos / 100;
}

// Pedido que ainda soma na conta da mesa: na mesa, não cancelado, não pago.
export function abertoNaMesa(pedido) {
  return Boolean(pedido.mesa) && pedido.status !== 'cancelado' && !pedido.pago_em;
}

// Mesas de 1 até quantidade, mais as mesas extras (ou fora do mapa) que
// têm pedido aberto. Cada mesa: { mesa, nome, extra, pedidos, total }.
// total em reais; ocupada quando tem pedido aberto.
export function montarMapa(pedidos, quantidade) {
  const mesas = new Map();
  for (let n = 1; n <= quantidade; n++) mesas.set(n, { mesa: n, nome: null, extra: false, pedidos: [], total: 0 });
  // Do mais antigo para o mais novo: o nome que fica é o do pedido mais novo.
  const abertos = pedidos.filter(abertoNaMesa).sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  for (const p of abertos) {
    const mesa = mesas.get(p.mesa) ?? { mesa: p.mesa, nome: null, extra: true, pedidos: [], total: 0 };
    mesa.pedidos.push(p);
    mesa.total += totalDoPedido(p);
    if (p.nome_mesa) mesa.nome = p.nome_mesa;
    mesas.set(p.mesa, mesa);
  }
  return [...mesas.values()].sort((a, b) => a.mesa - b.mesa);
}

export function rotuloDaMesa(mesa) {
  return mesa.nome || `Mesa ${mesa.mesa}`;
}

// Próxima mesa extra: o primeiro número livre acima do mapa e o nome
// "Extra 1", "Extra 2"... que ainda não esteja em uso.
export function proximaMesaExtra(mapa, quantidade) {
  const ocupados = new Set(mapa.filter((m) => m.pedidos.length).map((m) => m.mesa));
  let mesa = quantidade + 1;
  while (ocupados.has(mesa) && mesa < ULTIMA_MESA) mesa++;
  if (ocupados.has(mesa)) return null;
  const nomes = new Set(mapa.map((m) => (m.nome ?? '').toLowerCase()));
  let n = 1;
  while (nomes.has(`extra ${n}`)) n++;
  return { mesa, nome: `Extra ${n}` };
}

// Taxa de serviço arredondada para o centavo (mesma conta do banco).
export function servicoEmCentavos(consumoCentavos, taxa) {
  return Math.round((consumoCentavos * taxa) / 100);
}

// Dividir igual: cada pessoa paga o mesmo; o centavo que sobra vai para a
// última. 100,00 / 3 = 33,33 + 33,33 + 33,34.
export function dividirIgual(totalCentavos, pessoas) {
  const n = Math.max(1, Math.floor(pessoas));
  const parte = Math.floor(totalCentavos / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? totalCentavos - parte * (n - 1) : parte));
}

// Quanto ainda falta anotar (negativo: anotou a mais).
export function faltaAnotar(totalCentavos, partes) {
  return totalCentavos - partes.reduce((s, p) => s + (p.centavos || 0), 0);
}
