export const LIMITE_ATRASO_MINUTOS = 15;

// Quanto tempo a cozinha tem para desfazer um "Pronto" tocado por engano.
// O banco aceita até 2 minutos; a tela oferece menos, com folga para a internet.
export const DESFAZER_PRONTO_SEGUNDOS = 30;

// Pronto que ninguém marcou como entregue sai da tela do atendente depois disso
// (continua no banco e nos relatórios).
export const PRONTO_SAI_DA_LISTA_HORAS = 2;

// Por quanto tempo a cozinha vê o aviso de um pedido cancelado.
export const CANCELADO_VISIVEL_MINUTOS = 10;

export const STATUS = {
  pendente: { rotulo: 'Novo', cor: 'var(--color-accent-pedidos)' },
  em_preparo: { rotulo: 'Preparando', cor: 'var(--color-brand-orange)' },
  pronto: { rotulo: 'Pronto', cor: 'var(--color-accent-relatorios)' },
  entregue: { rotulo: 'Entregue', cor: 'var(--text-secondary)' },
  cancelado: { rotulo: 'Cancelado', cor: 'var(--color-accent-cozinha)' },
};

export const STATUS_ABERTOS = ['pendente', 'em_preparo', 'pronto'];
export const STATUS_NA_FILA = ['pendente', 'em_preparo'];

export const MOTIVOS_CANCELAMENTO = [
  { id: 'cliente_desistiu', rotulo: 'Cliente desistiu' },
  { id: 'erro_lancamento', rotulo: 'Lançado errado' },
  { id: 'faltou_ingrediente', rotulo: 'Faltou ingrediente' },
  { id: 'outro', rotulo: 'Outro motivo' },
];

export function rotuloDoMotivo(id) {
  return MOTIVOS_CANCELAMENTO.find((m) => m.id === id)?.rotulo ?? 'Outro motivo';
}

export function podeEditar(pedido) {
  return STATUS_NA_FILA.includes(pedido.status);
}
