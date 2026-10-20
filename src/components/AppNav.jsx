import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import { useAuth } from '../context/useAuth';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import ThemeToggle from './ThemeToggle';
import { corDeTexto } from '../lib/cores';
import { ProductsIcon, OrdersIcon, KitchenIcon, ReportsIcon, LogoutIcon, UserIcon } from './icons/AppIcons';

const items = [
  { label: 'Produtos', route: '/produtos', icon: ProductsIcon, accent: 'var(--color-accent-produtos)' },
  { label: 'Pedidos', route: '/pedidos', icon: OrdersIcon, accent: 'var(--color-accent-pedidos)' },
  { label: 'Cozinha', route: '/cozinha', icon: KitchenIcon, accent: 'var(--color-accent-cozinha)' },
  { label: 'Relatórios', route: '/relatorios', icon: ReportsIcon, accent: 'var(--color-accent-relatorios)' },
];

const botaoRedondo =
  'inline-flex items-center justify-center w-11 h-11 rounded-full border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)] transition-colors';

export default function AppNav() {
  const navigate = useNavigate();
  const { mode } = useTheme();
  const { sair, modoDemo } = useAuth();

  async function handleSair() {
    await sair();
    navigate(modoDemo ? '/' : '/login', { replace: true });
  }

  const logo = (
    <Link to="/home" className="shrink-0 rounded-lg" aria-label="Organiza+, painel principal">
      <img src={mode === 'dark' ? logoDark : logoLight} alt="" width="1372" height="434" className="h-7 md:h-8 w-auto" />
    </Link>
  );

  const acoes = (
    <div className="ml-auto flex items-center gap-2">
      <ThemeToggle />
      <Link to="/minha-conta" aria-label="Minha conta" title="Minha conta" className={botaoRedondo}>
        <UserIcon className="w-5 h-5" />
      </Link>
      <button type="button" onClick={handleSair} aria-label="Sair" title="Sair" className={botaoRedondo}>
        <LogoutIcon className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop / tablet: barra fixa no topo */}
      <header className="hidden md:block sticky top-0 z-20 bg-[var(--surface-alt)]/95 backdrop-blur border-b border-[var(--border-subtle)]">
        <div className="max-w-6xl mx-auto flex items-center gap-6 lg:gap-8 px-6 py-3">
          {logo}
          <nav aria-label="Principal" className="flex items-center gap-1">
            {items.map(({ label, route, icon: Icon, accent }) => (
              <NavLink
                key={route}
                to={route}
                className="flex items-center gap-2 min-h-11 px-3 lg:px-4 rounded-lg text-sm font-medium transition-colors"
                style={({ isActive }) => ({
                  color: isActive ? corDeTexto(accent) : 'var(--text-secondary)',
                  backgroundColor: isActive ? `color-mix(in srgb, ${accent} 15%, transparent)` : 'transparent',
                })}
              >
                <Icon className="w-5 h-5" />
                {label}
              </NavLink>
            ))}
          </nav>
          {acoes}
        </div>
      </header>

      {/* Mobile: topo com logo, tema, conta e sair */}
      <header className="md:hidden sticky top-0 z-20 bg-[var(--surface-alt)]/95 backdrop-blur border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2 px-4 py-2">
          {logo}
          {acoes}
        </div>
      </header>

      {/* Mobile: barra fixa embaixo */}
      <nav
        aria-label="Principal"
        className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-[var(--surface-alt)]/95 backdrop-blur border-t border-[var(--border-subtle)] pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="flex items-stretch justify-around">
          {items.map(({ label, route, icon: Icon, accent }) => (
            <NavLink
              key={route}
              to={route}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 min-h-14"
              style={({ isActive }) => ({ color: isActive ? corDeTexto(accent) : 'var(--text-secondary)' })}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
