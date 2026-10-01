import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { hojeNoNegocio } from '../lib/formatadores';
import { lerDemo, salvarDemo } from './demoStore';

const CODIGO_DEMO = 'demonstracao';
const NOME_DEMO = 'Meu negócio (demonstração)';

export class ErroPaginaPublica extends Error {
  // tipo: 'conexao' (sem internet) ou 'limite' (muitas consultas)
  constructor(tipo, mensagem) {
    super(mensagem);
    this.tipo = tipo;
  }
}

function erroDaConsulta(error) {
  if (error.code === 'P0001') return new ErroPaginaPublica('limite', error.message);
  return new ErroPaginaPublica('conexao', 'Sem conexão. Tentando de novo...');
}

export function enderecoDaPagina(codigo) {
  return `${window.location.origin}/p/${codigo}`;
}

function configDemo() {
  return { codigo: CODIGO_DEMO, nome_publico: null, ativa: true, ...lerDemo().pagina };
}

// ---------------------------------------------------------------------------
// Visitante (sem conta)
// ---------------------------------------------------------------------------

export async function buscarPaginaPublica(codigo) {
  if (!isSupabaseConfigured) {
    const pagina = configDemo();
    return codigo === pagina.codigo && pagina.ativa ? { nome: pagina.nome_publico || NOME_DEMO } : null;
  }

  const { data, error } = await supabase.rpc('pagina_publica', { p_codigo: codigo });
  if (error) throw erroDaConsulta(error);
  return data;
}

// Mesma resposta da função acompanhar_pedido do banco.
export async function acompanharPedido(codigo, numero) {
  if (!isSupabaseConfigured) {
    const pagina = configDemo();
    const db = lerDemo();
    const hoje = hojeNoNegocio();
    const doDia = (p) => (p.dia ?? hojeNoNegocio(new Date(p.criado_em))) === hoje;
    const pedido = codigo === pagina.codigo && pagina.ativa && db.pedidos.find((p) => doDia(p) && p.numero === numero);
    if (!pedido) return { encontrado: false };

    const naFila = (p) => ['pendente', 'em_preparo'].includes(p.status);
    const fila = db.pedidos.filter((p) => doDia(p) && naFila(p)).sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
    const prontos = db.pedidos
      .filter((p) => doDia(p) && p.pronto_em && p.status !== 'cancelado')
      .sort((a, b) => new Date(b.pronto_em) - new Date(a.pronto_em))
      .slice(0, 10);
    const tempos = prontos.map((p) => (new Date(p.pronto_em) - new Date(p.criado_em)) / 60000);

    return {
      encontrado: true,
      status: pedido.status,
      posicao: naFila(pedido) ? fila.findIndex((p) => p.id === pedido.id) + 1 : null,
      tempo_medio_min: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
      faltou: naFila(pedido) && db.itens_pedido.some((i) => i.pedido_id === pedido.id && i.faltou),
    };
  }

  const { data, error } = await supabase.rpc('acompanhar_pedido', { p_codigo: codigo, p_numero: numero });
  if (error) throw erroDaConsulta(error);
  return data;
}

// ---------------------------------------------------------------------------
// Dono
// ---------------------------------------------------------------------------

export async function buscarConfiguracaoPagina() {
  if (!isSupabaseConfigured) {
    const { codigo, nome_publico, ativa } = configDemo();
    return { codigo, nomeCadastro: NOME_DEMO, nomePublico: nome_publico ?? '', ativa };
  }

  const { data, error } = await supabase
    .from('negocios')
    .select('codigo_publico, nome, nome_publico, pagina_ativa')
    .maybeSingle();
  if (error || !data) throw new Error('Não foi possível carregar a página do cliente.');
  return {
    codigo: data.codigo_publico,
    nomeCadastro: data.nome,
    nomePublico: data.nome_publico ?? '',
    ativa: data.pagina_ativa,
  };
}

export async function salvarConfiguracaoPagina({ nomePublico, ativa }) {
  const nome = nomePublico.trim();
  if (nome.length > 60) throw new Error('O nome pode ter no máximo 60 caracteres.');

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    salvarDemo({ ...db, pagina: { ...configDemo(), nome_publico: nome || null, ativa } });
    return;
  }

  const { error } = await supabase.rpc('configurar_pagina_publica', { p_nome_publico: nome, p_ativa: ativa });
  if (error) throw new Error(error.code === 'P0001' ? error.message : 'Não foi possível salvar.');
}

export async function trocarCodigoPagina() {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const codigo = `demonstracao-${Date.now().toString(36)}`;
    salvarDemo({ ...db, pagina: { ...configDemo(), codigo } });
    return codigo;
  }

  const { data, error } = await supabase.rpc('trocar_codigo_publico');
  if (error) throw new Error(error.code === 'P0001' ? error.message : 'Não foi possível trocar o endereço.');
  return data;
}
