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
