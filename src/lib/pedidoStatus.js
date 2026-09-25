export const LIMITE_ATRASO_MINUTOS = 15;

// corAcao = cor do botão que leva ao próximo status.
export const STATUS = {
  pendente: {
    rotulo: 'Novo',
    cor: 'var(--color-accent-pedidos)',
    proximo: 'em_preparo',
    acao: 'Começar preparo',
    corAcao: 'var(--color-brand-orange)',
  },
  em_preparo: {
    rotulo: 'Preparando',
    cor: 'var(--color-brand-orange)',
    proximo: 'pronto',
    acao: 'Marcar como pronto',
    corAcao: 'var(--color-accent-relatorios)',
  },
  pronto: {
    rotulo: 'Pronto',
    cor: 'var(--color-accent-relatorios)',
    proximo: 'entregue',
    acao: 'Entregue',
    corAcao: 'var(--color-accent-relatorios)',
  },
  entregue: { rotulo: 'Entregue', cor: 'var(--text-secondary)', proximo: null, acao: null, corAcao: null },
};

export const STATUS_ABERTOS = ['pendente', 'em_preparo', 'pronto'];
