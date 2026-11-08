// Promoções por dia e horário ("Terça do hambúrguer", "Happy hour"). Mesmas
// regras e textos de promocao_vale e salvar_promocao no banco.
import { formatarMoeda, hojeNoNegocio } from './formatadores';

// 0 = domingo ... 6 = sábado (como o extract(dow) do Postgres).
export const DIAS_DA_SEMANA = [
  { id: 1, curto: 'Seg', nome: 'segunda' },
  { id: 2, curto: 'Ter', nome: 'terça' },
  { id: 3, curto: 'Qua', nome: 'quarta' },
  { id: 4, curto: 'Qui', nome: 'quinta' },
  { id: 5, curto: 'Sex', nome: 'sexta' },
  { id: 6, curto: 'Sáb', nome: 'sábado' },
  { id: 0, curto: 'Dom', nome: 'domingo' },
];
const NOME_DO_DIA = Object.fromEntries(DIAS_DA_SEMANA.map((d) => [d.id, d.nome]));
export const LIMITE_NOME_PROMOCAO = 60;
export const MAXIMO_DE_ITENS_NA_PROMOCAO = 50;
// O dia de trabalho vira às 5h: antes disso ainda é o dia anterior.
const VIRADA = 5;

const horaEmFortaleza = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Fortaleza',
});

// "17:00:00" (do banco) ou "17:00" → "17:00". Vazio: null.
export function horaCurta(hora) {
  if (!hora) return null;
  const [h, m] = String(hora).split(':');
  return `${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
}

function segundos(hora) {
  const [h, m, s] = String(hora).split(':').map(Number);
  return h * 3600 + (m || 0) * 60 + (s || 0);
}

// Dia da semana do dia de trabalho (0 = domingo) e a hora em Fortaleza.
function quando(momento, virada) {
  const dia = hojeNoNegocio(momento, virada);
  return { dia: new Date(`${dia}T12:00:00Z`).getUTCDay(), agora: segundos(horaEmFortaleza.format(new Date(momento))) };
}

// A promoção vale neste instante? promo: { dias, hora_inicio, hora_fim, ativa }.
export function promocaoVale(promo, momento = new Date(), virada = VIRADA) {
  if (!promo?.ativa) return false;
  const { dia, agora } = quando(momento, virada);
  if (!promo.dias.includes(dia)) return false;
  if (!promo.hora_inicio) return true;
  const inicio = segundos(promo.hora_inicio);
  const fim = segundos(promo.hora_fim);
  return inicio < fim ? agora >= inicio && agora < fim : agora >= inicio || agora < fim;
}

// alvo: { produtoId, tamanhoId } ou { comboId }.
function mesmoAlvo(item, alvo) {
  if (alvo.comboId) return item.combo_id === alvo.comboId;
  return !item.combo_id && item.produto_id === alvo.produtoId && (item.tamanho_id ?? null) === (alvo.tamanhoId ?? null);
}

// A promoção mais barata que vale agora para o alvo, se for mais barata que o
// normal: { preco, promocao }. Senão, null. (Mesma escolha de preco_em_promocao.)
export function precoEmPromocao(promocoes, alvo, normal, momento = new Date()) {
  let melhor = null;
  for (const promo of promocoes ?? []) {
    if (!promocaoVale(promo, momento)) continue;
    for (const item of promo.itens) {
      if (!mesmoAlvo(item, alvo)) continue;
      if (!melhor || item.preco < melhor.preco) melhor = { preco: item.preco, promocao: promo };
    }
  }
  return melhor && melhor.preco < normal ? melhor : null;
}

function horaFalada(hora) {
  const [h, m] = horaCurta(hora).split(':').map(Number);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

// "Promoção até 19h" no cartão; "Promoção hoje" quando é o dia todo.
export function seloDaPromocao(promo) {
  return promo.hora_inicio ? `Promoção até ${horaFalada(promo.hora_fim)}` : 'Promoção hoje';
}

// Dias seguidos viram "de segunda a sexta"; "todo dia" com os 7.
export function textoDosDias(dias) {
  const ordem = DIAS_DA_SEMANA.map((d) => d.id).filter((id) => dias.includes(id));
  if (ordem.length === 7) return 'Todo dia';
  const posicoes = ordem.map((id) => DIAS_DA_SEMANA.findIndex((d) => d.id === id));
  const seguidos = ordem.length >= 3 && posicoes.every((p, i) => i === 0 || p === posicoes[i - 1] + 1);
  const primeiro = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
  if (seguidos) return primeiro(`de ${NOME_DO_DIA[ordem[0]]} a ${NOME_DO_DIA[ordem.at(-1)]}`);
  const nomes = ordem.map((id) => NOME_DO_DIA[id]);
  return primeiro(nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`);
}

// "De segunda a sexta, das 17h às 19h" / "Terça, o dia todo".
export function textoDoHorario(promo) {
  const dias = textoDosDias(promo.dias);
  if (!promo.hora_inicio) return `${dias}, o dia todo`;
  return `${dias}, das ${horaFalada(promo.hora_inicio)} às ${horaFalada(promo.hora_fim)}`;
}

// As mesmas conferências de salvar_promocao, antes de mandar.
// itens: [{ nome, normal, preco, combo }] (preco já em número; NaN = vazio).
export function conferirPromocao({ nome, dias, diaTodo, inicio, fim, itens }) {
  const limpo = (nome ?? '').trim().replace(/\s+/g, ' ');
  if (!limpo) throw new Error('Digite o nome da promoção.');
  if (limpo.length > LIMITE_NOME_PROMOCAO) throw new Error('O nome da promoção pode ter no máximo 60 letras.');
  if (!dias.length) throw new Error('Escolha pelo menos um dia da semana.');
  if (!diaTodo) {
    if (!inicio || !fim) throw new Error('Diga a hora de começar e a de terminar, ou marque o dia todo.');
    const de = segundos(inicio);
    const ate = segundos(fim);
    if (de === ate) throw new Error('A hora de terminar precisa ser diferente da hora de começar.');
    if (de < VIRADA * 3600) throw new Error(`A promoção precisa começar a partir das ${VIRADA}h. Antes disso ainda é o dia anterior.`);
    if (ate < de && ate > VIRADA * 3600) throw new Error(`Passando da meia-noite, a promoção pode ir até as ${VIRADA}h.`);
  }
  if (!itens.length || itens.length > MAXIMO_DE_ITENS_NA_PROMOCAO) throw new Error('A promoção precisa ter de 1 a 50 itens.');
  for (const item of itens) {
    if (!(item.preco > 0)) throw new Error(`Digite o preço de ${item.nome} na promoção.`);
    if (item.combo && item.preco < 1) throw new Error(`O preço do ${item.nome} na promoção precisa ser de pelo menos R$ 1,00.`);
    if (item.preco >= item.normal) {
      throw new Error(`O preço de ${item.nome} na promoção precisa ser menor que o normal (${formatarMoeda(item.normal)}).`);
    }
  }
  return limpo;
}
