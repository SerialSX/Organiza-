// Mesas: passar os pedidos para outra mesa (ou juntar duas), fechar a conta e
// desfazer o recebimento. Mesmas regras de passar_mesa, fechar_conta_mesa e
// desfazer_conta_mesa no banco (supabase/schema.sql).
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { lerDemo, salvarDemo, novoId, MESAS_DEMO } from './demoStore';
import { colunaInexistente, FORMAS_DE_PAGAMENTO } from './pedidos';
import { totalDoPedido } from '../lib/caixa';
import { emCentavos, limparNomeMesa, servicoEmCentavos } from '../lib/mesas';
import { hojeNoNegocio } from '../lib/formatadores';

export const JEITOS_DE_PAGAR = ['um_pagou', 'dividiram', 'separado'];
const FORMAS = new Set(FORMAS_DE_PAGAMENTO.map((f) => f.id));

function mensagemDoBanco(error, padrao) {
  return error.code === 'P0001' ? error.message : padrao;
}

function falha(mensagem) {
  throw new Error(mensagem);
}

function conferirIds(ids) {
  if (!ids?.length || ids.length > 200) falha('Escolha de 1 a 200 pedidos.');
}

// Tabela que não existe: banco ainda sem a migração das mesas.
function tabelaInexistente(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || colunaInexistente(error);
}

// Passa os pedidos abertos para outra mesa. Se ela já tem pedidos, as duas
// contas viram uma só. nomeMesa: o nome da mesa de destino, se for extra.
export async function passarMesa(ids, mesa, nomeMesa = null) {
  conferirIds(ids);
  if (!Number.isInteger(mesa) || mesa < 1 || mesa > 999) falha('O número da mesa precisa ficar entre 1 e 999.');
  const nome = limparNomeMesa(nomeMesa);

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const agora = new Date().toISOString();
    let quantos = 0;
    const pedidos = db.pedidos.map((p) => {
      if (!ids.includes(p.id) || !p.mesa || p.status === 'cancelado' || p.pago_em || p.nao_recebido_em) return p;
      quantos++;
      return { ...p, mesa, nome_mesa: nome, alterado_em: agora, atualizado_em: agora };
    });
    salvarDemo({ ...db, pedidos });
    return quantos;
  }

  const { data, error } = await supabase.rpc('passar_mesa', { p_pedido_ids: ids, p_mesa: mesa, p_nome_mesa: nome });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível passar a mesa. Tente de novo.'));
  return data;
}

// jeito: 'um_pagou' | 'dividiram' | 'separado'.
// pagamentos: [{ forma, centavos }] (vazio quando pagaram separado).
// cobrarServico: false quando o cliente não quis pagar a taxa.
export async function fecharContaMesa(ids, { jeito, cobrarServico, pagamentos = [] }) {
  conferirIds(ids);
  if (!JEITOS_DE_PAGAR.includes(jeito)) falha('Escolha como pagaram.');
  for (const p of pagamentos) {
    if (!FORMAS.has(p.forma)) falha('Escolha como foi paga cada parte.');
    if (!Number.isInteger(p.centavos) || p.centavos < 0) falha('Valor inválido numa das partes.');
  }
  const partes = pagamentos.map((p) => ({ forma: p.forma, valor: p.centavos / 100 }));

  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const pedidos = db.pedidos.filter((p) => ids.includes(p.id));
    if (pedidos.length !== new Set(ids).size) falha('Um dos pedidos não foi encontrado. Atualize a tela.');
    if (pedidos.some((p) => !p.mesa || p.status === 'cancelado' || p.pago_em || p.nao_recebido_em)) {
      falha('Esta conta mudou: algum pedido já foi recebido ou cancelado. Atualize a tela.');
    }
    if (new Set(pedidos.map((p) => p.mesa)).size !== 1) falha('Os pedidos precisam ser da mesma mesa.');
    const itens = (id) => db.itens_pedido.filter((i) => i.pedido_id === id);
    const consumo = pedidos.reduce((s, p) => s + emCentavos(totalDoPedido({ itens: itens(p.id) })), 0);
    const taxa = cobrarServico ? ({ ...MESAS_DEMO, ...db.perfil }.taxa_servico ?? 0) : 0;
    const servico = servicoEmCentavos(consumo, taxa);
    if (jeito === 'separado' && partes.length) falha('Pagaram separado: não anote as partes.');
    if (jeito === 'um_pagou' && partes.length !== 1) falha('Escolha como o cliente pagou.');
    if (jeito === 'dividiram' && (partes.length < 1 || partes.length > 30)) falha('Anote de 1 a 30 partes.');
    const soma = pagamentos.reduce((s, p) => s + p.centavos, 0);
    if (jeito !== 'separado' && soma !== consumo + servico) {
      falha('A soma das partes não bate com o total da conta. Confira os valores.');
    }
    const maisNovo = [...pedidos].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))[0];
    const agora = new Date().toISOString();
    const conta = {
      id: novoId(),
      dia: pedidos.map(p => p.dia ?? hojeNoNegocio(new Date(p.criado_em))).sort()[0],
      mesa: maisNovo.mesa,
      nome_mesa: maisNovo.nome_mesa ?? null,
      consumo: consumo / 100,
      taxa_servico: servico > 0 ? taxa : 0,
      servico: servico / 100,
      jeito,
      criado_em: agora,
    };
    salvarDemo({
      ...db,
      contas_mesa: [...(db.contas_mesa ?? []), conta],
      pagamentos_conta: [
        ...(db.pagamentos_conta ?? []),
        ...partes.filter((p) => p.valor > 0).map((p) => ({ id: novoId(), conta_id: conta.id, ...p })),
      ],
      pedidos: db.pedidos.map((p) =>
        ids.includes(p.id)
          ? {
              ...p,
              conta_id: conta.id,
              pago_em: agora,
              forma_pagamento: null,
              // Mesma regra do banco: a mesa pagou e foi embora, o que estava
              // pronto já foi levado.
              ...(p.status === 'pronto' ? { status: 'entregue', entregue_em: agora } : {}),
              atualizado_em: agora,
            }
          : p,
      ),
    });
    return conta.id;
  }

  const { data, error } = await supabase.rpc('fechar_conta_mesa', {
    p_pedido_ids: ids,
    p_jeito: jeito,
    p_cobrar_servico: Boolean(cobrarServico),
    p_pagamentos: partes.length ? partes : null,
  });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível fechar a conta. Tente de novo.'));
  return data;
}

// Recebeu errado: a conta some e os pedidos voltam a ficar abertos na mesa.
export async function desfazerContaMesa(contaId) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    if (!(db.contas_mesa ?? []).some((c) => c.id === contaId)) falha('Esta conta já foi desfeita. Atualize a tela.');
    const agora = new Date().toISOString();
    salvarDemo({
      ...db,
      contas_mesa: db.contas_mesa.filter((c) => c.id !== contaId),
      pagamentos_conta: (db.pagamentos_conta ?? []).filter((p) => p.conta_id !== contaId),
      pedidos: db.pedidos.map((p) => (p.conta_id === contaId ? { ...p, conta_id: null, pago_em: null, atualizado_em: agora } : p)),
    });
    return;
  }

  const { error } = await supabase.rpc('desfazer_conta_mesa', { p_conta_id: contaId });
  if (error) throw new Error(mensagemDoBanco(error, 'Não foi possível desfazer. Tente de novo.'));
}

function normalizarConta(c, pagamentos) {
  return {
    id: c.id,
    dia: c.dia,
    mesa: c.mesa,
    nome_mesa: c.nome_mesa ?? null,
    consumo: Number(c.consumo),
    taxa_servico: c.taxa_servico ?? 0,
    servico: Number(c.servico),
    jeito: c.jeito,
    criado_em: c.criado_em,
    pagamentos: pagamentos.map((p) => ({ forma: p.forma, valor: Number(p.valor) })),
  };
}

// Contas de mesa fechadas no dia de trabalho (AAAA-MM-DD), com as partes.
export async function listarContasDoDia(dia) {
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    return (db.contas_mesa ?? [])
      .filter((c) => c.dia === dia)
      .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em))
      .map((c) => normalizarConta(c, (db.pagamentos_conta ?? []).filter((p) => p.conta_id === c.id)));
  }

  const { data, error } = await supabase
    .from('contas_mesa')
    .select('id, dia, mesa, nome_mesa, consumo, taxa_servico, servico, jeito, criado_em, pagamentos_conta ( forma, valor )')
    .eq('dia', dia)
    .order('criado_em', { ascending: true })
    .limit(1000);
  // Banco sem a migração das mesas: ainda não há contas fechadas.
  if (tabelaInexistente(error)) return [];
  if (error) throw new Error('Não foi possível carregar as contas das mesas.');
  return data.map((c) => normalizarConta(c, c.pagamentos_conta ?? []));
}

// Noites (antes de hoje, nos últimos `dias`) em que abriram mesa extra, e
// quantas extras cada uma teve: [{ dia, extras }]. Serve para sugerir mais
// mesas no mapa.
export async function noitesComMesaExtra(dias = 14) {
  const hoje = hojeNoNegocio();
  const inicio = new Date(`${hoje}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - dias);
  const desde = inicio.toISOString().slice(0, 10);

  let linhas;
  if (!isSupabaseConfigured) {
    linhas = lerDemo().pedidos.filter((p) => p.nome_mesa && p.dia && p.dia >= desde && p.dia < hoje);
  } else {
    const { data, error } = await supabase
      .from('pedidos')
      .select('dia, mesa')
      .not('nome_mesa', 'is', null)
      .gte('dia', desde)
      .lt('dia', hoje)
      .limit(2000);
    if (tabelaInexistente(error)) return [];
    if (error) throw new Error('Não foi possível ver as mesas extras.');
    linhas = data;
  }
  const porDia = new Map();
  for (const l of linhas) {
    const mesas = porDia.get(l.dia) ?? new Set();
    mesas.add(l.mesa);
    porDia.set(l.dia, mesas);
  }
  return [...porDia.entries()].map(([dia, mesas]) => ({ dia, extras: mesas.size })).sort((a, b) => a.dia.localeCompare(b.dia));
}
