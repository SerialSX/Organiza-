import { AlertIcon, CheckIcon } from '../icons/AppIcons';

const estilos = {
  erro: { cor: 'var(--color-accent-cozinha)', Icone: AlertIcon },
  sucesso: { cor: 'var(--color-accent-relatorios)', Icone: CheckIcon },
};

export default function Aviso({ tipo = 'erro', children, className = '' }) {
  const { cor, Icone } = estilos[tipo];

  return (
    <div
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${className}`}
      style={{
        color: cor,
        borderColor: `color-mix(in srgb, ${cor} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${cor} 12%, transparent)`,
      }}
    >
      <Icone className="w-5 h-5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
