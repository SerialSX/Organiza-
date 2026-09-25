import { useNavigate } from 'react-router-dom';
import AppShell from '../components/ui/AppShell';
import { useAuth } from '../context/useAuth';
import { usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { ProductsIcon, OrdersIcon, KitchenIcon, ReportsIcon } from '../components/icons/AppIcons';

const cards = [
  {
    key: 'produtos',
    label: 'Produtos',
    description: 'Cadastre o que você vende',
    route: '/produtos',
    icon: ProductsIcon,
    accent: 'var(--color-accent-produtos)',
  },
  {
    key: 'pedidos',
    label: 'Pedidos',
    description: 'Anote um novo pedido',
    route: '/pedidos',
    icon: OrdersIcon,
    accent: 'var(--color-accent-pedidos)',
  },
  {
    key: 'cozinha',
    label: 'Cozinha',
    description: 'Veja o que precisa preparar',
    route: '/cozinha',
    icon: KitchenIcon,
    accent: 'var(--color-accent-cozinha)',
  },
  {
    key: 'relatorios',
    label: 'Relatórios',
    description: 'Veja o que mais vendeu',
    route: '/relatorios',
    icon: ReportsIcon,
    accent: 'var(--color-accent-relatorios)',
  },
];

export default function Home() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const { pedidos, carregando } = usePedidosAbertos();
  const pendentes = pedidos.filter((p) => p.status !== 'pronto').length;
  const badges = carregando ? {} : { cozinha: pendentes === 1 ? '1 pendente' : `${pendentes} pendentes` };

  return (
    <AppShell largura="max-w-4xl">
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1 break-words">
        {perfil?.negocio_nome || 'Painel principal'}
      </h1>
      <p className="text-[var(--text-secondary)] text-sm mb-8">O que você quer fazer agora?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(({ key, label, description, route, icon: Icon, accent }) => {
          const badge = badges[key];
          return (
            <button
              key={key}
              onClick={() => navigate(route)}
              className="text-left bg-[var(--surface-card)] hover:bg-[var(--surface-card-hover)] border border-[var(--border-subtle)] rounded-2xl p-6 flex items-start gap-4 transition"
            >
              <span
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl shrink-0"
                style={{ backgroundColor: accent }}
              >
                <Icon className="w-7 h-7 text-white" />
              </span>
              <span className="flex flex-col">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-lg text-[var(--text-primary)]">{label}</span>
                  {badge && (
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: accent }}
                    >
                      {badge}
                    </span>
                  )}
                </span>
                <span className="text-sm text-[var(--text-secondary)] mt-0.5">{description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </AppShell>
  );
}
