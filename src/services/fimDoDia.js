// Fim do dia: encerrar o dia e resolver o que ficou aberto. Mesmas regras de
// encerrar_dia, marcar_entregues, marcar_nao_recebido, desfazer_nao_recebido,
// cancelar_conta e marcar_devolvido no banco (supabase/schema.sql).
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { lerDemo, salvarDemo } from './demoStore';
import { colunaInexistente, funcaoInexistente } from './pedidos';
import { MOTIVOS_CANCELAMENTO, STATUS_ABERTOS } from '../lib/pedidoStatus';
import { emAberto, quantosPedidos } from '../lib/fimDoDia';
import { hojeNoNegocio } from '../lib/formatadores';

const BANCO_ATRASADO = 'Esta parte ainda não chegou ao banco de dados. Avise a equipe para atualizar o banco.';

function mensagemDoBanco(error, padrao) {
  if (funcaoInexistente(error)) return BANCO_ATRASADO;
  return error.code === 'P0001' ? error.message : padrao;
}

function falha(mensagem) {
  throw new Error(mensagem);
}

function conferirIds(ids) {
  if (!ids?.length || ids.length > 200) falha('Escolha de 1 a 200 pedidos.');
}

// Muda os pedidos escolhidos que passam no filtro. Devolve quantos mudaram.
function mudarDemo(ids, podeMudar, mudanca) {
  const db = lerDemo();
  const agora = new Date().toISOString();
  let quantos = 0;
  const pedidos = db.pedidos.map((p) => {
    if (!ids.includes(p.id) || !podeMudar(p)) return p;
    quantos++;
    return { ...p, ...mudanca(p, agora), atualizado_em: agora };
  });
  salvarDemo({ ...db, pedidos });
  return quantos;
}

async function chamar(funcao, argumentos, padrao) {
  const { data, error } = await supabase.rpc(funcao, argumentos);
  if (error) throw new Error(mensagemDoBanco(error, padrao));
  return data;
}

// Encerramento do dia ({ encerrado_em }) ou null. Banco sem a migração: null.
export async function buscarEncerramento(dia) {
  if (!isSupabaseConfigured) {
    return (lerDemo().dias_encerrados ?? []).find((d) => d.dia === dia) ?? null;
  }
  const { data, error } = await supabase.from('dias_encerrados').select('dia, encerrado_em').eq('dia', dia).maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || colunaInexistente(error)) return null;
    throw new Error('Não foi possível ver se o dia foi encerrado.');
  }
  return data;
}

// "Encerrar o dia": só com nenhum pedido em aberto. Devolve a hora.
export async function encerrarDia(dia) {
  if (!dia) falha('Este dia ainda não começou.');
  if (!isSupabaseConfigured) {
    if (dia > hojeNoNegocio()) falha('Este dia ainda não começou.');
    const db = lerDemo();
    const abertos = db.pedidos.filter((p) => (p.dia ?? hojeNoNegocio(new Date(p.criado_em))) === dia && emAberto(p)).length;
    if (abertos === 1) falha('Não dá para encerrar: 1 pedido está em aberto. Resolva antes de encerrar o dia.');
    if (abertos > 1) falha(`Não dá para encerrar: ${quantosPedidos(abertos)} estão em aberto. Resolva antes de encerrar o dia.`);
    const ja = (db.dias_encerrados ?? []).find((d) => d.dia === dia);
    if (ja) return ja.encerrado_em;
    const encerrado_em = new Date().toISOString();
    salvarDemo({ ...db, dias_encerrados: [...(db.dias_encerrados ?? []), { dia, encerrado_em }] });
    return encerrado_em;
  }
  return chamar('encerrar_dia', { p_dia: dia }, 'Não foi possível encerrar o dia. Tente de novo.');
}

// "Já foi entregue": um pedido ou todos os prontos de uma vez.
export async function marcarEntregues(ids) {
  conferirIds(ids);
  if (!isSupabaseConfigured) {
    return mudarDemo(
      ids,
      (p) => STATUS_ABERTOS.includes(p.status),
      (_, agora) => ({ status: 'entregue', entregue_em: agora }),
    );
  }
  return chamar('marcar_entregues', { p_pedido_ids: ids }, 'Não foi possível marcar como entregue.');
}

// "Foi embora sem pagar".
export async function marcarNaoRecebido(ids) {
  conferirIds(ids);
  if (!isSupabaseConfigured) {
    return mudarDemo(
      ids,
      (p) => p.status !== 'cancelado' && !p.pago_em && !p.nao_recebido_em,
      (p, agora) => ({
        nao_recebido_em: agora,
        ...(STATUS_ABERTOS.includes(p.status) ? { status: 'entregue', entregue_em: agora } : {}),
      }),
    );
  }
  return chamar('marcar_nao_recebido', { p_pedido_ids: ids }, 'Não foi possível marcar como não recebido.');
}

// O cliente voltou para pagar (ou foi tocado por engano): a conta reabre.
export async function desfazerNaoRecebido(ids) {
  conferirIds(ids);
  if (!isSupabaseConfigured) {
    return mudarDemo(
      ids,
      (p) => Boolean(p.nao_recebido_em),
      () => ({ nao_recebido_em: null }),
    );
  }
  return chamar('desfazer_nao_recebido', { p_pedido_ids: ids }, 'Não foi possível desfazer.');
}

// "Cancelar a conta": todos os pedidos que ninguém pagou, de uma vez.
export async function cancelarConta(ids, motivo) {
  conferirIds(ids);
  if (!MOTIVOS_CANCELAMENTO.some((m) => m.id === motivo)) falha('Escolha o motivo do cancelamento.');
  if (!isSupabaseConfigured) {
    const db = lerDemo();
    const escolhidos = db.pedidos.filter((p) => ids.includes(p.id) && p.status !== 'cancelado');
    if (escolhidos.some((p) => p.pago_em || p.nao_recebido_em)) falha('Esta conta mudou: algum pedido já foi recebido. Atualize a tela.');
    return mudarDemo(
      ids,
      (p) => p.status !== 'cancelado',
      (_, agora) => ({ status: 'cancelado', cancelado_em: agora, motivo_cancelamento: motivo }),
    );
  }
  return chamar('cancelar_conta', { p_pedido_ids: ids, p_motivo: motivo }, 'Não foi possível cancelar a conta.');
}

// "Devolvi": o dinheiro do pedido pago e cancelado voltou para o cliente.
export async function marcarDevolvido(id) {
  if (!isSupabaseConfigured) {
    const quantos = mudarDemo(
      [id],
      (p) => p.status === 'cancelado' && p.pago_em && !p.conta_id && p.devolucao !== 'devolvido',
      (_, agora) => ({ devolucao: 'devolvido', devolvido_em: agora }),
    );
    if (!quantos) falha('Este dinheiro já foi marcado como devolvido. Atualize a tela.');
    return;
  }
  await chamar('marcar_devolvido', { p_pedido_id: id }, 'Não foi possível marcar como devolvido.');
}
