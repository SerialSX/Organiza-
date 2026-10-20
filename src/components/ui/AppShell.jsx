import AppNav from '../AppNav';
import { useAuth } from '../../context/useAuth';
import { useOnline } from '../../hooks/useOnline';
import { WifiOffIcon } from '../icons/AppIcons';

export default function AppShell({ children, largura = 'max-w-5xl' }) {
  const { modoDemo } = useAuth();
  const online = useOnline();

  return (
    <div className="min-h-svh bg-[var(--surface)] pb-24 md:pb-0">
      <a
        href="#conteudo"
        className="sr-only-focusable fixed left-4 top-4 z-50 rounded-xl bg-[var(--surface-alt)] px-4 py-3 font-semibold text-[var(--text-primary)] shadow-lg"
      >
        Pular para o conteúdo
      </a>
      <AppNav />
      <div role="region" aria-label="Avisos do sistema" className="empty:hidden">
      {!online && (
        <p
          role="alert"
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-[var(--sobre-destaque)] bg-[var(--color-accent-cozinha)]"
        >
          <WifiOffIcon className="w-5 h-5 shrink-0" />
          Sem internet. Pedidos não estão sendo enviados nem recebidos.
        </p>
      )}
      {modoDemo && (
        <p className="text-center text-xs font-medium px-4 py-2 text-[var(--text-primary)] bg-[color-mix(in_srgb,var(--color-brand-orange)_18%,transparent)]">
          Modo demonstração: os dados ficam salvos só neste navegador.
        </p>
      )}
      </div>
      <main id="conteudo" tabIndex={-1} className={`${largura} mx-auto px-4 sm:px-6 py-6 sm:py-10 outline-none`}>
        {children}
      </main>
    </div>
  );
}
