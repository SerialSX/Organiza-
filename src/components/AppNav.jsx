import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import ThemeToggle from './ThemeToggle';
import { ProductsIcon, OrdersIcon, KitchenIcon, ReportsIcon } from './icons/AppIcons';

const items = [
  { key: 'produtos', label: 'Produtos', route: '/produtos', icon: ProductsIcon, accent: 'var(--color-accent-produtos)' },
  { key: 'pedidos', label: 'Pedidos', route: '/pedidos', icon: OrdersIcon, accent: 'var(--color-accent-pedidos)' },
  { key: 'cozinha', label: 'Cozinha', route: '/cozinha', icon: KitchenIcon, accent: 'var(--color-accent-cozinha)' },
  { key: 'relatorios', label: 'Relatórios', route: '/relatorios', icon: ReportsIcon, accent: 'var(--color-accent-relatorios)' },
];

export default function AppNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode } = useTheme();

  return (
    <>
      {/* Desktop / tablet: barra fixa no topo */}
      <header className="hidden md:block sticky top-0 z-20 bg-[var(--surface-alt)]/95 backdrop-blur border-b border-[var(--border-subtle)]">
        <div className="max-w-6xl mx-auto flex items-center gap-8 px-6 py-3">
          <img
            src={mode === 'dark' ? logoDark : logoLight}
            alt="Organiza+"
            className="h-8 w-auto cursor-pointer"
            onClick={() => navigate('/home')}
          />
          <nav className="flex items-center gap-1">
            {items.map(({ key, label, route, icon: Icon, accent }) => {
              const active = location.pathname === route;
              return (
                <button
                  key={key}
                  onClick={() => navigate(route)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition"
                  style={{
                    color: active ? accent : 'var(--text-secondary)',
                    backgroundColor: active ? `color-mix(in srgb, ${accent} 15%, transparent)` : 'transparent',
                  }}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              );
            })}
          </nav>
          <ThemeToggle className="ml-auto" />
        </div>
      </header>

      {/* Mobile: barra fixa embaixo */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-[var(--surface-alt)]/95 backdrop-blur border-t border-[var(--border-subtle)] pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-stretch justify-around">
          {items.map(({ key, label, route, icon: Icon, accent }) => {
            const active = location.pathname === route;
            return (
              <button
                key={key}
                onClick={() => navigate(route)}
                className="flex-1 flex flex-col items-center gap-1 py-2.5"
                style={{ color: active ? accent : 'var(--text-secondary)' }}
              >
                <Icon className="w-6 h-6" />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
