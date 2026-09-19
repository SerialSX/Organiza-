import { KitchenIcon } from './icons/AppIcons';

const rows = [
  { label: 'Pedido #12', status: 'Pronto', tone: 'bg-emerald-500' },
  { label: 'Pedido #13', status: 'Em preparo', tone: 'bg-brand-orange' },
  { label: 'Pedido #14', status: 'Na fila', tone: 'bg-white/30' },
];

export default function ProductMockup() {
  return (
    <div className="relative w-full max-w-sm mx-auto">
      <div className="absolute -top-8 -right-6 w-32 h-32 rounded-full bg-brand-orange/30 blur-2xl" />
      <div className="absolute -bottom-10 -left-8 w-40 h-40 rounded-full bg-emerald-500/20 blur-2xl" />

      <div className="relative bg-[var(--surface-alt)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl p-5">
        <div className="flex items-center gap-1.5 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-auto text-[10px] font-semibold text-[var(--text-secondary)] tracking-wide">
            COZINHA · AO VIVO
          </span>
        </div>

        <div className="space-y-2.5">
          {rows.map((row) => (
            <div
              key={row.label}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                row.status === 'Em preparo'
                  ? 'border-brand-orange/50 bg-brand-orange/10'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-card)]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${row.tone}`} />
              <span className="text-sm font-medium text-[var(--text-primary)]">{row.label}</span>
              <span
                className={`ml-auto text-xs font-semibold ${
                  row.status === 'Em preparo' ? 'text-brand-orange' : 'text-[var(--text-secondary)]'
                }`}
              >
                {row.status}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-xl bg-brand-orange px-3 py-2.5">
          <KitchenIcon className="w-5 h-5 text-white shrink-0" />
          <span className="text-white text-sm font-semibold">
            Cozinha avisada em tempo real
          </span>
        </div>
      </div>
    </div>
  );
}
