import { formatarMoeda } from './formatadores';

// Como o dono compra. O banco guarda tudo na unidade base (g, ml ou un):
// "1 kg por R$ 45,00" vira 1000 g por R$ 45,00.
export const UNIDADES_DE_COMPRA = [
  { id: 'kg', base: 'g', fator: 1000 },
  { id: 'g', base: 'g', fator: 1 },
  { id: 'L', base: 'ml', fator: 1000 },
  { id: 'ml', base: 'ml', fator: 1 },
  { id: 'un', base: 'un', fator: 1 },
];

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

export function formatarQuantidade(quantidade, unidade) {
  return `${numero.format(quantidade)} ${unidade}`;
}

// Campos do formulário -> colunas do banco. Sem preço, a compra fica vazia.
export function compraParaBanco({ preco, quantidade, unidadeCompra }) {
  const unidade = UNIDADES_DE_COMPRA.find((u) => u.id === unidadeCompra) ?? UNIDADES_DE_COMPRA[0];
  if (preco === null) return { unidade: unidade.base, preco_compra: null, quantidade_compra: null };
  return {
    unidade: unidade.base,
    preco_compra: Math.round(preco * 100) / 100,
    quantidade_compra: Math.round(quantidade * unidade.fator * 1000) / 1000,
  };
}

// Colunas do banco -> campos do formulário, voltando para kg e L quando dá.
export function compraParaCampos(ingrediente) {
  const { unidade, quantidade_compra: qtd } = ingrediente;
  const grande = { g: 'kg', ml: 'L' }[unidade];
  if (qtd === null || qtd === undefined) return { quantidade: '', unidadeCompra: grande ?? unidade };
  if (grande && qtd >= 1000 && qtd % 1000 === 0) return { quantidade: String(qtd / 1000), unidadeCompra: grande };
  return { quantidade: numero.format(qtd), unidadeCompra: unidade };
}

export function precoPorUnidade(ingrediente) {
  const { preco_compra: preco, quantidade_compra: qtd } = ingrediente;
  if (preco === null || preco === undefined || !qtd) return null;
  return preco / qtd;
}

// "R$ 45,00 o kg", "R$ 12,00 por 12 un"
export function descreverCompra(ingrediente) {
  if (precoPorUnidade(ingrediente) === null) return 'Sem preço';
  const { quantidade, unidadeCompra } = compraParaCampos(ingrediente);
  const preco = formatarMoeda(ingrediente.preco_compra);
  return quantidade === '1' ? `${preco} o ${unidadeCompra}` : `${preco} por ${quantidade} ${unidadeCompra}`;
}

export function custoDaLinha(ingrediente, quantidade) {
  const unitario = precoPorUnidade(ingrediente);
  return unitario === null ? null : unitario * quantidade;
}

// Mesma conta do recalcular_custo_do_produto no banco: soma só o que tem
// preço; sem nenhum ingrediente com preço, não há estimativa (null).
export function estimarCusto(lista, ingredientesPorId) {
  let total = null;
  const semPreco = [];
  for (const { ingrediente_id: id, quantidade } of lista) {
    const ingrediente = ingredientesPorId[id];
    if (!ingrediente) continue;
    const custo = custoDaLinha(ingrediente, quantidade);
    if (custo === null) semPreco.push(ingrediente.nome);
    else total = (total ?? 0) + custo;
  }
  return { total: total === null ? null : Math.round(total * 100) / 100, semPreco };
}
