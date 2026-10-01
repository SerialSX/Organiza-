import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/ui/AppShell';
import Aviso from '../components/ui/Aviso';
import CancelarPedido from '../components/CancelarPedido';
import { atualizarStatusPedido } from '../services/pedidos';
import { separarPedidos } from '../lib/fila';
import { numeroDoPedido } from '../lib/formatadores';
import { STATUS } from '../lib/pedidoStatus';
import { useAuth } from '../context/useAuth';
import { usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { ProductsIcon, OrdersIcon, KitchenIcon, ReportsIcon, AlertIcon, CheckIcon, QrIcon } from '../components/icons/AppIcons';

function dataCurta(dia) {
  const [, mes, d] = dia.split('-');
  return `${d}/${mes}`;
}

function Pendencia({ pedido, onErro }) {
  const [salvando, setSalvando] = useState(false);

  async function entregue() {
    setSalvando(true);
    try {
      await atualizarStatusPedido(pedido.id, 'entregue');
    } catch (e) {
      onErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xl font-extrabold text-[var(--text-primary)]">{numeroDoPedido(pedido)}</span>
        <span className="text-sm text-[var(--text-secondary)]">
          {dataCurta(pedido.dia)} · {STATUS[pedido.status].rotulo}
        </span>
      </div>
      <p className="text-sm text-[var(--text-secondary)] break-words">
        {pedido.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={entregue}
          disabled={salvando}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: STATUS.pronto.cor }}
        >
          <CheckIcon className="w-5 h-5" />
          Foi entregue
        </button>
        <CancelarPedido pedidoId={pedido.id} onErro={onErro} />
      </div>
    </li>
  );
}

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
  const [erro, setErro] = useState('');
  const { fila, prontos, pendencias } = separarPedidos(pedidos);
  const badges = carregando
    ? {}
    : {
        cozinha: `${fila.length} na fila`,
        ...(prontos.length ? { pedidos: `${prontos.length} ${prontos.length === 1 ? 'pronto' : 'prontos'}` } : {}),
      };

  return (
    <AppShell largura="max-w-4xl">
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1 break-words">
        {perfil?.negocio_nome || 'Painel principal'}
      </h1>
      <p className="text-[var(--text-secondary)] text-sm mb-8">O que você quer fazer agora?</p>

      {pendencias.length > 0 && (
        <section className="mb-8 rounded-2xl border-2 border-[var(--color-brand-orange)] p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <AlertIcon className="w-6 h-6 shrink-0 text-[var(--color-brand-orange)]" />
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {pendencias.length === 1 ? '1 pedido ficou em aberto' : `${pendencias.length} pedidos ficaram em aberto`}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                De dias anteriores ou prontos há mais de 2 horas. Diga o que aconteceu com cada um.
              </p>
            </div>
          </div>
          {erro && <Aviso>{erro}</Aviso>}
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pendencias.map((p) => (
              <Pendencia key={p.id} pedido={p} onErro={setErro} />
            ))}
          </ul>
        </section>
      )}

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

      <button
        type="button"
        onClick={() => navigate('/pagina-do-cliente')}
        className="mt-4 w-full text-left bg-[var(--surface-card)] hover:bg-[var(--surface-card-hover)] border border-[var(--border-subtle)] rounded-2xl p-5 flex items-center gap-4 transition"
      >
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl shrink-0 bg-[var(--color-brand-orange)]">
          <QrIcon className="w-6 h-6 text-white" />
        </span>
        <span className="flex flex-col">
          <span className="font-semibold text-[var(--text-primary)]">Página do cliente</span>
          <span className="text-sm text-[var(--text-secondary)]">QR code para o cliente acompanhar o pedido</span>
        </span>
      </button>
    </AppShell>
  );
}
