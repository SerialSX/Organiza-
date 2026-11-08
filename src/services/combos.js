import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { lerDemo, salvarDemo, assinarDemo, novoId } from './demoStore';
import { conferirCombo } from '../lib/combos';
import { tamanhosAtivos } from './custoDemo';

// Migração 2026-11-15 (combos e promoções). null: ainda não sabe; false: banco
// sem a migração (as telas escondem combos e promoções e seguem como antes).
let bancoTemCombos = isSupabaseConfigured ? null : true;

export function aceitaCombos() {
  return bancoTemCombos !== false;
}

// Tabela que o banco ainda não tem (PGRST205: fora do cache do PostgREST).
export function semTabelaDosCombos(error) {
  return (
    ['PGRST205', 'PGRST200', '42P01'].includes(error?.code) ||
    /combo|promoc/i.test(`${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`)
  );
}

export function marcarBancoSemCombos() {
  bancoTemCombos = false;
}

const CAMPOS = 'id, nome, preco, disponivel, criado_em, combo_partes ( id, ordem, nome, combo_opcoes ( id, produto_id, tamanho_id, acrescimo, ordem ) )';

function normalizar(c) {
  return {
    id: c.id,
    nome: c.nome,
    preco: Number(c.preco),
    disponivel: c.disponivel ?? true,
    partes: [...(c.combo_partes ?? [])]
      .sort((a, b) => a.ordem - b.ordem)
      .map((p) => ({
        id: p.id,
        nome: p.nome ?? null,
        opcoes: [...(p.combo_opcoes ?? [])]
          .sort((a, b) => a.ordem - b.ordem)
          .map((o) => ({ id: o.id, produto_id: o.produto_id, tamanho_id: o.tamanho_id ?? null, acrescimo: Number(o.acrescimo ?? 0) })),
      })),
  };
}

function porNome(a, b) {
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

function mensagemDoBanco(error, padrao) {
  return error.code === 'P0001' ? error.message : padrao;
}

function falha(texto) {
  throw new Error(texto);
}

// No modo demonstração as partes e opções ficam à parte, como no banco.
function comPartesDemo(db) {
  return (c) => ({
    ...c,
    combo_partes: (db.combo_partes ?? [])
      .filter((p) => p.combo_id === c.id)
      .map((p) => ({ ...p, combo_opcoes: (db.combo_opcoes ?? []).filter((o) => o.parte_id === p.id) })),
  });
}

export async function listarCombos() {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    return (db.combos ?? []).filter((c) => !c.arquivado).map(comPartesDemo(db)).map(normalizar).sort(porNome);
  }
  if (bancoTemCombos === false) return [];

  const { data, error } = await supabase.from('combos').select(CAMPOS).eq('arquivado', false).order('nome');
  if (error && semTabelaDosCombos(error)) {
    bancoTemCombos = false;
    return [];
  }
  if (error) throw new Error('Não foi possível carregar os combos.');
  bancoTemCombos = true;
  return data.map(normalizar);
}

// Mesmas regras de salvar_combo no banco, para o modo demonstração.
function salvarComboDemo(db, id, nome, preco, partes) {
  const combos = db.combos ?? [];
  if (combos.some((c) => !c.arquivado && c.id !== id && c.nome.trim().toLowerCase() === nome.toLowerCase())) {
    falha(`Já existe um combo chamado ${nome}.`);
  }
  const existente = id ? combos.find((c) => c.id === id && !c.arquivado) : null;
  if (id && !existente) falha('Este combo foi excluído. Atualize a tela.');
  const comboId = id ?? novoId();
  const agora = new Date().toISOString();
  const novasPartes = [];
  const novasOpcoes = [];
  partes.forEach((parte, ordem) => {
    const parteId = novoId();
    novasPartes.push({ id: parteId, combo_id: comboId, ordem, nome: (parte.nome ?? '').trim().replace(/\s+/g, ' ') || null });
    parte.opcoes.forEach((o, ordemOpcao) => {
      const produto = db.produtos.find((p) => p.id === o.produto_id && !p.arquivado);
      if (!produto) falha('Um dos produtos do combo foi excluído. Revise o combo.');
      const tamanhos = tamanhosAtivos(db, produto.id);
      if (o.tamanho_id && !tamanhos.some((t) => t.id === o.tamanho_id)) {
        falha(`Um dos tamanhos de ${produto.nome} saiu do cardápio. Revise o combo.`);
      }
      if (!o.tamanho_id && tamanhos.length) falha(`Escolha o tamanho de ${produto.nome} no combo.`);
      novasOpcoes.push({
        id: novoId(),
        parte_id: parteId,
        produto_id: produto.id,
        tamanho_id: o.tamanho_id ?? null,
        acrescimo: o.acrescimo ?? 0,
        ordem: ordemOpcao,
      });
    });
  });
  const partesQueSaem = new Set((db.combo_partes ?? []).filter((p) => p.combo_id === comboId).map((p) => p.id));
  const combo = existente
    ? { ...existente, nome, preco, atualizado_em: agora }
    : { id: comboId, nome, preco, disponivel: true, arquivado: false, criado_em: agora, atualizado_em: agora };
  salvarDemo({
    ...db,
    combos: existente ? combos.map((c) => (c.id === comboId ? combo : c)) : [...combos, combo],
    combo_partes: [...(db.combo_partes ?? []).filter((p) => !partesQueSaem.has(p.id)), ...novasPartes],
    combo_opcoes: [...(db.combo_opcoes ?? []).filter((o) => !partesQueSaem.has(o.parte_id)), ...novasOpcoes],
  });
  return comboId;
}

// Cria (sem id) ou troca um combo inteiro. partes: [{ nome, opcoes: [{
// produto_id, tamanho_id, acrescimo, rotulo }] }], na ordem. Pedidos já feitos
// não mudam: cada item guardou o nome e o preço.
export async function salvarCombo({ id = null, nome, preco, partes }) {
  const precoCerto = Math.round(preco * 100) / 100;
  const limpas = partes.map((p) => ({
    nome: (p.nome ?? '').trim().replace(/\s+/g, ' ') || null,
    opcoes: p.opcoes.map((o) => ({
      produto_id: o.produto_id,
      tamanho_id: o.tamanho_id ?? null,
      acrescimo: Math.round((o.acrescimo ?? 0) * 100) / 100,
      rotulo: o.rotulo,
    })),
  }));
  const nomeLimpo = conferirCombo({ nome, preco: precoCerto, partes: limpas });
  const paraEnviar = limpas.map((p) => ({
    nome: p.nome,
    opcoes: p.opcoes.map((o) => ({ produto_id: o.produto_id, tamanho_id: o.tamanho_id, acrescimo: o.acrescimo })),
  }));

  if (!isSupabaseConfigured) return salvarComboDemo(lerDemo(), id, nomeLimpo, precoCerto, paraEnviar);

  const { data, error } = await supabase.rpc('salvar_combo', {
    p_combo_id: id,
    p_nome: nomeLimpo,
    p_preco: precoCerto,
    p_partes: paraEnviar,
  });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      bancoTemCombos = false;
      falha('O banco de dados ainda não aceita combos. Avise quem cuida do sistema.');
    }
    falha(mensagemDoBanco(error, 'Não foi possível salvar o combo.'));
  }
  return data;
}

async function atualizar(id, alteracoes, erro) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    salvarDemo({ ...db, combos: (db.combos ?? []).map((c) => (c.id === id ? { ...c, ...alteracoes } : c)) });
    return;
  }
  const { error } = await supabase.from('combos').update(alteracoes).eq('id', id);
  if (error) throw new Error(erro);
}

// "Esgotado" do combo inteiro, ligado pelo dono (além do que esgota sozinho
// quando falta uma parte).
export function mudarDisponivelDoCombo(id, disponivel) {
  return atualizar(id, { disponivel }, 'Não foi possível atualizar o combo.');
}

// Arquiva em vez de apagar: os pedidos antigos continuam com o nome do combo.
export function excluirCombo(id) {
  return atualizar(id, { arquivado: true }, 'Não foi possível excluir o combo.');
}

// Combos e promoções mudaram em outro aparelho.
export function assinarCombos(negocioId, callback) {
  if (!isSupabaseConfigured) return assinarDemo(callback);
  if (bancoTemCombos === false) return () => {};
  const canais = ['combos', 'promocoes'].map((tabela) =>
    supabase
      .channel(`${tabela}-${negocioId}-${novoId()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tabela, filter: `negocio_id=eq.${negocioId}` }, callback)
      .subscribe((status) => status === 'SUBSCRIBED' && callback()),
  );
  return () => canais.forEach((c) => supabase.removeChannel(c));
}
