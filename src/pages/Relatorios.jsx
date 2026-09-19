import AppNav from '../components/AppNav';
import { ReportsIcon } from '../components/icons/AppIcons';

export default function Relatorios() {
  return (
    <div className="min-h-screen bg-[var(--surface)] pb-24 md:pb-0">
      <AppNav />
      <div className="flex flex-col items-center justify-center text-center px-6 py-24 gap-4">
        <span
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl"
          style={{ backgroundColor: 'var(--color-accent-relatorios)' }}
        >
          <ReportsIcon className="w-8 h-8 text-white" />
        </span>
        <p className="text-[var(--text-secondary)]">
          Relatórios — em breve (Fase 5).
        </p>
      </div>
    </div>
  );
}
