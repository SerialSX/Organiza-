const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarMoeda(valor) {
  return moeda.format(Number(valor) || 0);
}

// Aceita "12,50", "12.50", "R$ 12,50", "1.234,56" e "1.500".
export function lerValor(texto) {
  if (texto === null || texto === undefined) return NaN;
  let limpo = String(texto).replace(/[^\d,.-]/g, '').trim();
  if (limpo === '') return NaN;
  if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
  // "1.500" no Brasil é mil e quinhentos, não 1,5
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) limpo = limpo.replace(/\./g, '');
  return Number(limpo);
}

export function valorParaCampo(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  return Number(valor).toFixed(2).replace('.', ',');
}

export function minutosDesde(data, agora = Date.now()) {
  return Math.max(0, Math.floor((agora - new Date(data).getTime()) / 60000));
}

export function formatarEspera(minutos) {
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas}h ${resto}min` : `${horas}h`;
}

export function formatarHora(data) {
  return new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Código curto para a equipe chamar o pedido ("#A3F9"). O id completo é uuid.
export function codigoPedido(id) {
  return `#${String(id).replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

// Senha de 1 a 999 que o cliente ouve e digita no QR, sempre com 3 dígitos
// ("007"), como senha de balcão.
export function formatarSenha(numero) {
  return String(numero).padStart(3, '0');
}

// Pedidos antigos do modo demonstração, de antes da senha existir, caem no
// código curto do id.
export function numeroDoPedido(pedido) {
  return pedido.numero ? formatarSenha(pedido.numero) : codigoPedido(pedido.id);
}

// Para onde vai o pedido: a mesa (consumo no salão; a mesa extra pelo nome,
// "Varanda") ou o balcão, onde o cliente retira quando chamam a senha.
export function destinoDoPedido(pedido) {
  if (!pedido.mesa) return 'Balcão';
  return pedido.nome_mesa || `Mesa ${pedido.mesa}`;
}

// Como a cozinha anuncia o pedido (e o leitor de tela lê): "007", "007, mesa 12"
// ou "007, Carlos" quando o atendente anotou o nome.
export function chamadaDoPedido(pedido) {
  const partes = [numeroDoPedido(pedido)];
  if (pedido.mesa) partes.push(pedido.nome_mesa || `mesa ${pedido.mesa}`);
  if (pedido.identificacao) partes.push(pedido.identificacao);
  return partes.join(', ');
}

const diaEmFortaleza = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza' });

// Hora em que o dia de trabalho do negócio vira (negocios.virada_do_dia).
// Com 5, um pedido à 1h da manhã ainda é do dia anterior. Vem do perfil ao
// entrar; fica aqui para todas as telas usarem a mesma regra do banco.
let viradaDoDia = 0;

export function definirViradaDoDia(horas) {
  viradaDoDia = Number.isInteger(horas) && horas >= 0 && horas <= 8 ? horas : 0;
}

// Mesmo "dia" que o banco grava em pedidos.dia (AAAA-MM-DD, fuso de Fortaleza,
// descontada a virada), para separar a fila de hoje das pendências mesmo com o
// relógio do aparelho em outro fuso.
export function hojeNoNegocio(agora = new Date(), virada = viradaDoDia) {
  return diaEmFortaleza.format(new Date(new Date(agora).getTime() - virada * 3600000));
}

// Trocar a virada agora mudaria o dia de trabalho em andamento (entre 0h e
// 8h)? Aí a senha recomeçaria no meio do turno. Mesma regra do
// configurar_operacao no banco.
export function viradaMudaODia(nova, atual, agora = new Date()) {
  return nova !== atual && hojeNoNegocio(agora, nova) !== hojeNoNegocio(agora, atual);
}

// Início do dia de trabalho (AAAA-MM-DD) como instante: meia-noite de
// Fortaleza mais a virada.
export function inicioDoDia(dia, virada = viradaDoDia) {
  return new Date(`${dia}T${String(virada).padStart(2, '0')}:00:00-03:00`);
}
