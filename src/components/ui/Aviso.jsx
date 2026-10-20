import { AlertIcon, CheckIcon, InfoIcon } from '../icons/AppIcons';

const estilos = {
  erro: { cor: 'var(--color-accent-cozinha)', Icone: AlertIcon, papel: 'alert' },
  sucesso: { cor: 'var(--color-accent-relatorios)', Icone: CheckIcon, papel: 'status' },
  info: { cor: 'var(--color-brand-orange)', Icone: InfoIcon, papel: 'status' },
};

// A cor fica na borda, no fundo e no ícone; o texto usa a cor normal para ter
// contraste suficiente nos dois temas.
export default function Aviso({ tipo = 'erro', children, className = '' }) {
  const { cor, Icone, papel } = estilos[tipo];

  return (
    <div
      role={papel}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-[var(--text-primary)] ${className}`}
      style={{
        borderColor: `color-mix(in srgb, ${cor} 55%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${cor} 12%, transparent)`,
      }}
    >
      <Icone className="w-5 h-5 shrink-0" style={{ color: cor }} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
