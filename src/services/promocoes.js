import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { lerDemo, salvarDemo, novoId } from './demoStore';
import { conferirPromocao, horaCurta } from '../lib/promocoes';
import { aceitaCombos, marcarBancoSemCombos, semTabelaDosCombos } from './combos';
import { tamanhosAtivos } from './custoDemo';
import { nomeDoItem } from '../lib/meioAMeio';

// Promoções vêm na mesma migração dos combos (2026-11-15): aceitaCombos() vale
// para as duas.
const CAMPOS = 'id, nome, dias, hora_inicio, hora_fim, ativa, criado_em, promocao_itens ( id, produto_id, tamanho_id, combo_id, preco )';

function normalizar(p) {
  return {
    id: p.id,
    nome: p.nome,
    dias: [...(p.dias ?? [])].map(Number).sort((a, b) => a - b),
    hora_inicio: horaCurta(p.hora_inicio),
    hora_fim: horaCurta(p.hora_fim),
    ativa: p.ativa ?? true,
    criado_em: p.criado_em,
    itens: (p.promocao_itens ?? []).map((i) => ({
      id: i.id,
      produto_id: i.produto_id ?? null,
      tamanho_id: i.tamanho_id ?? null,
      combo_id: i.combo_id ?? null,
      preco: Number(i.preco),
    })),
  };
}

function mensagemDoBanco(error, padrao) {
  return error.code === 'P0001' ? error.message : padrao;
}

function falha(texto) {
  throw new Error(texto);
}

// Mesma ordem de preco_em_promocao: no empate de preço, a mais antiga.
function porCriacao(a, b) {
  return String(a.criado_em).localeCompare(String(b.criado_em)) || String(a.id).localeCompare(String(b.id));
}

export async function listarPromocoes() {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    return (db.promocoes ?? [])
      .map((p) => ({ ...p, promocao_itens: (db.promocao_itens ?? []).filter((i) => i.promocao_id === p.id) }))
      .map(normalizar)
      .sort(porCriacao);
  }
  if (!aceitaCombos()) return [];

  const { data, error } = await supabase.from('promocoes').select(CAMPOS).order('criado_em');
  if (error && semTabelaDosCombos(error)) {
    marcarBancoSemCombos();
    return [];
  }
  if (error) throw new Error('Não foi possível carregar as promoções.');
  return data.map(normalizar).sort(porCriacao);
}

// O preço normal e o nome do que entra na promoção, com as regras de
// salvar_promocao (modo demonstração).
function alvoDemo(db, item) {
  if (item.combo_id) {
    const combo = (db.combos ?? []).find((c) => c.id === item.combo_id && !c.arquivado);
    if (!combo) falha('Um dos combos da promoção foi excluído. Revise a promoção.');
    return { normal: combo.preco, nome: combo.nome, combo: true, chave: `c|${combo.id}` };
  }
  const produto = db.produtos.find((p) => p.id === item.produto_id && !p.arquivado);
  if (!produto) falha('Um dos produtos da promoção foi excluído. Revise a promoção.');
  const tamanhos = tamanhosAtivos(db, produto.id);
  if (item.tamanho_id) {
    const tamanho = tamanhos.find((t) => t.id === item.tamanho_id);
    if (!tamanho) falha(`Um dos tamanhos de ${produto.nome} saiu do cardápio. Revise a promoção.`);
    return { normal: tamanho.preco, nome: nomeDoItem(produto.nome, tamanho.nome, null), chave: `${produto.id}|${tamanho.id}` };
  }
  if (tamanhos.length) falha(`Escolha o tamanho de ${produto.nome} na promoção.`);
  return { normal: produto.preco, nome: produto.nome, chave: `${produto.id}|` };
}

// Cria (sem id) ou troca uma promoção. dias: 0 = domingo ... 6 = sábado.
// diaTodo, ou inicio e fim ("17:00"). itens: [{ produto_id, tamanho_id } ou
// { combo_id }, com preco], com nome e normal para as mensagens.
export async function salvarPromocao({ id = null, nome, dias, diaTodo, inicio, fim, itens }) {
  const lista = itens.map((i) => ({ ...i, preco: Math.round(Number(i.preco) * 100) / 100 }));
  const nomeLimpo = conferirPromocao({ nome, dias, diaTodo, inicio, fim, itens: lista });
  const diasCertos = [...new Set(dias)].sort((a, b) => a - b);
  const paraEnviar = lista.map((i) =>
    i.combo_id ? { combo_id: i.combo_id, preco: i.preco } : { produto_id: i.produto_id, tamanho_id: i.tamanho_id ?? null, preco: i.preco },
  );
  const horaDe = diaTodo ? null : inicio;
  const horaAte = diaTodo ? null : fim;

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const promocoes = db.promocoes ?? [];
    const existente = id ? promocoes.find((p) => p.id === id) : null;
    if (id && !existente) falha('Esta promoção foi apagada. Atualize a tela.');
    const promocaoId = id ?? novoId();
    const vistos = new Set();
    const novos = paraEnviar.map((i) => {
      const alvo = alvoDemo(db, i);
      if (i.preco >= alvo.normal) falha(`O preço de ${alvo.nome} na promoção precisa ser menor que o normal.`);
      if (vistos.has(alvo.chave)) falha(`${alvo.nome} aparece duas vezes na promoção.`);
      vistos.add(alvo.chave);
      return { id: novoId(), promocao_id: promocaoId, produto_id: null, tamanho_id: null, combo_id: null, ...i };
    });
    const agora = new Date().toISOString();
    const dados = { nome: nomeLimpo, dias: diasCertos, hora_inicio: horaDe, hora_fim: horaAte, atualizado_em: agora };
    salvarDemo({
      ...db,
      promocoes: existente
        ? promocoes.map((p) => (p.id === id ? { ...p, ...dados } : p))
        : [...promocoes, { id: promocaoId, ativa: true, criado_em: agora, ...dados }],
      promocao_itens: [...(db.promocao_itens ?? []).filter((i) => i.promocao_id !== promocaoId), ...novos],
    });
    return promocaoId;
  }

  const { data, error } = await supabase.rpc('salvar_promocao', {
    p_promocao_id: id,
    p_nome: nomeLimpo,
    p_dias: diasCertos,
    p_hora_inicio: horaDe,
    p_hora_fim: horaAte,
    p_itens: paraEnviar,
  });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      marcarBancoSemCombos();
      falha('O banco de dados ainda não aceita promoções. Avise quem cuida do sistema.');
    }
    falha(mensagemDoBanco(error, 'Não foi possível salvar a promoção.'));
  }
  return data;
}

// Pausar e ligar de novo: vale na hora para os pedidos novos.
export async function mudarAtivaDaPromocao(id, ativa) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    salvarDemo({ ...db, promocoes: (db.promocoes ?? []).map((p) => (p.id === id ? { ...p, ativa } : p)) });
    return;
  }
  const { error } = await supabase.from('promocoes').update({ ativa }).eq('id', id);
  if (error) throw new Error('Não foi possível atualizar a promoção.');
}

// Apagar de vez: os pedidos feitos guardam o nome dela e o preço que deram.
export async function apagarPromocao(id) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    salvarDemo({
      ...db,
      promocoes: (db.promocoes ?? []).filter((p) => p.id !== id),
      promocao_itens: (db.promocao_itens ?? []).filter((i) => i.promocao_id !== id),
      itens_pedido: db.itens_pedido.map((i) => (i.promocao_id === id ? { ...i, promocao_id: null } : i)),
    });
    return;
  }
  const { error } = await supabase.from('promocoes').delete().eq('id', id);
  if (error) throw new Error('Não foi possível apagar a promoção.');
}
