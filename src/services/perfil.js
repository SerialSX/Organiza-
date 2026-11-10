import { supabase } from '../lib/supabaseClient';
import { definirViradaDoDia } from '../lib/formatadores';

// Perfil de quem entrou: dados do usuário e do negócio dele.
const CAMPOS_PERFIL = 'id, nome, papel, negocio_id';
// Do mais novo para o mais antigo: cada migração acrescenta colunas. Se o banco
// estiver atrás do código, usa a primeira consulta que ele entende.
const CAMPOS_NEGOCIO = [
  'nome, virada_do_dia, usa_tela_cozinha, modo_atendimento, quantidade_mesas, taxa_servico, regra_meio_a_meio', // 2026-11-14
  'nome, virada_do_dia, usa_tela_cozinha, modo_atendimento, quantidade_mesas, taxa_servico', // 2026-11-11
  'nome, virada_do_dia, usa_tela_cozinha, modo_atendimento', // 2026-11-10
  'nome, virada_do_dia, usa_tela_cozinha', // 2026-11-08
  'nome',
];

// 42703 / PGRST204: coluna que não existe, ou seja, banco ainda sem a migração.
function colunaInexistente(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /does not exist/i.test(error?.message ?? '');
}

export async function buscarPerfil(usuario) {
  const consulta = (camposDoNegocio) =>
    supabase.from('usuarios').select(`${CAMPOS_PERFIL}, negocios ( ${camposDoNegocio} )`).eq('id', usuario.id).maybeSingle();
  // Banco atrás do código (migração ainda não rodou): pede só o que existe.
  // Assim a pessoa entra, vê o aviso de banco desatualizado e pode sair, em
  // vez de ficar presa em "Sem conexão com o sistema".
  let data;
  let error;
  for (const campos of CAMPOS_NEGOCIO) {
    ({ data, error } = await consulta(campos));
    if (!colunaInexistente(error)) break;
  }
  // Erro de rede não pode virar "perfil inexistente"; quem chama decide.
  if (error) throw error;
  if (!data) return null;
  const { negocios: negocio, ...resto } = data;
  definirViradaDoDia(negocio?.virada_do_dia ?? 0);
  return {
    ...resto,
    email: usuario.email,
    negocio_nome: negocio?.nome ?? '',
    // Só sem a migração 2026-11-08 estes campos faltam (ver a consulta
    // reserva acima). O login funciona, mas lançar pedido não: o aviso de
    // banco desatualizado aparece e a migração precisa rodar antes do deploy.
    virada_do_dia: negocio?.virada_do_dia ?? 0,
    usa_tela_cozinha: negocio?.usa_tela_cozinha ?? true,
    // null: o dono ainda não respondeu as perguntas de boas-vindas. Banco sem
    // a coluna (undefined): segue com os dois jeitos, como era antes, e não
    // prende ninguém numa pergunta que não daria para salvar.
    modo_atendimento: negocio?.modo_atendimento === undefined ? 'balcao_e_mesa' : negocio.modo_atendimento,
    // null: o dono ainda não respondeu quantas mesas tem e se cobra serviço.
    // undefined: banco sem a migração das mesas; o pedido de mesa volta a ser
    // pelo número digitado, sem mapa nem taxa.
    quantidade_mesas: negocio?.quantidade_mesas,
    taxa_servico: negocio?.taxa_servico,
    // null: o dono ainda não escolheu como cobra o meio a meio (pergunta ao
    // marcar o primeiro produto). undefined: banco sem a migração 2026-11-14;
    // as telas escondem o meio a meio.
    regra_meio_a_meio: negocio?.regra_meio_a_meio,
  };
}
