// Modo demonstração: a mesma conta do recalcular_custo_do_produto e do
// sincronizar_produto_com_tamanhos no banco (supabase/schema.sql).
import { estimarCusto } from '../lib/custos';

function numero(v) {
  return v === null || v === undefined ? null : Number(v);
}

function porIdDosIngredientes(db) {
  return Object.fromEntries(
    (db.ingredientes ?? []).map((i) => [
      i.id,
      { ...i, preco_compra: numero(i.preco_compra), quantidade_compra: numero(i.quantidade_compra) },
    ]),
  );
}

export function tamanhosAtivos(db, produtoId) {
  return (db.produto_tamanhos ?? [])
    .filter((t) => t.produto_id === produtoId && !t.arquivado)
    .sort((a, b) => a.ordem - b.ordem || String(a.criado_em).localeCompare(String(b.criado_em)));
}

// Produto com tamanhos: preço e custo do produto acompanham o primeiro tamanho.
export function sincronizarDemo(db, produtoId) {
  const [primeiro] = tamanhosAtivos(db, produtoId);
  if (!primeiro) return db;
  return {
    ...db,
    produtos: db.produtos.map((p) => (p.id === produtoId ? { ...p, preco: primeiro.preco, custo: primeiro.custo ?? null } : p)),
  };
}

// Só muda o custo de quem tem ingrediente com preço (o digitado à mão fica).
export function recalcularCustoDemo(db, produtoIds) {
  const porId = porIdDosIngredientes(db);
  const produtos = db.produtos.map((p) => {
    if (!produtoIds.includes(p.id)) return p;
    const { total } = estimarCusto((db.produto_ingredientes ?? []).filter((pi) => pi.produto_id === p.id), porId);
    return total === null ? p : { ...p, custo: total };
  });
  const produto_tamanhos = (db.produto_tamanhos ?? []).map((t) => {
    if (!produtoIds.includes(t.produto_id)) return t;
    const { total } = estimarCusto((db.tamanho_ingredientes ?? []).filter((ti) => ti.tamanho_id === t.id), porId);
    return total === null ? t : { ...t, custo: total };
  });
  return produtoIds.reduce((novo, id) => sincronizarDemo(novo, id), { ...db, produtos, produto_tamanhos });
}
