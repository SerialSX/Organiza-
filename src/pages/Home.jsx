import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AppShell from '../components/ui/AppShell';
import Aviso from '../components/ui/Aviso';
import Botao from '../components/ui/Botao';
import Etiqueta from '../components/ui/Etiqueta';
import CancelarPedido from '../components/CancelarPedido';
import ResolverPendencias from '../components/fimDoDia/ResolverPendencias';
import { atualizarStatusPedido } from '../services/pedidos';
import { separarPedidos } from '../lib/fila';
import { hojeNoNegocio, numeroDoPedido } from '../lib/formatadores';
import { STATUS } from '../lib/pedidoStatus';
import { useAuth } from '../context/useAuth';
import { atendeNoBalcao, modoDoNegocio, taxaDoNegocio } from '../lib/atendimento';
import { usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { usePendenciasAnteriores } from '../hooks/usePendenciasAnteriores';
import { ProductsIcon, OrdersIcon, KitchenIcon, ReportsIcon, AlertIcon, CheckIcon, QrIcon } from '../components/icons/AppIcons';
import { resumoDosItens } from '../lib/combos';

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
        <span className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{numeroDoPedido(pedido)}</span>
        <Etiqueta cor={STATUS[pedido.status].cor}>{STATUS[pedido.status].rotulo}</Etiqueta>
      </div>
      <p className="text-sm text-[var(--text-secondary)] break-words">
        {resumoDosItens(pedido.itens)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Botao cor={STATUS.pronto.cor} onClick={entregue} disabled={salvando}>
          <CheckIcon className="w-5 h-5" />
          Foi entregue
        </Botao>
        <CancelarPedido pedidoId={pedido.id} pago={Boolean(pedido.pago_em) && !pedido.conta_id} onErro={onErro} />
      </div>
    </li>
  );
}

const cards = [
  { key: 'produtos', label: 'Produtos', description: 'Cadastre o que você vende', route: '/produtos', icon: ProductsIcon, accent: 'var(--color-accent-produtos)' },
  { key: 'pedidos', label: 'Pedidos', description: 'Anote um novo pedido', route: '/pedidos', icon: OrdersIcon, accent: 'var(--color-accent-pedidos)' },
  { key: 'cozinha', label: 'Cozinha', description: 'Veja o que precisa preparar', route: '/cozinha', icon: KitchenIcon, accent: 'var(--color-accent-cozinha)' },
  { key: 'relatorios', label: 'Relatórios', description: 'Veja o que mais vendeu', route: '/relatorios', icon: ReportsIcon, accent: 'var(--color-accent-relatorios)' },
];

const classeCartao =
  'text-left bg-[var(--surface-card)] hover:bg-[var(--surface-card-hover)] border border-[var(--border-subtle)] rounded-2xl flex items-center gap-4 transition-colors';

export default function Home() {
  const { perfil } = useAuth();
  const { pedidos, carregando } = usePedidosAbertos();
  const { pedidos: anteriores, carregando: carregandoAnteriores } = usePendenciasAnteriores();
  const [erro, setErro] = useState('');
  const { fila, prontos, pendencias } = separarPedidos(pedidos);
  // Os de dias anteriores ficam em "Pendências do dia anterior" (com contas
  // sem receber); aqui ficam só os prontos de hoje esquecidos há horas.
  const hoje = hojeNoNegocio();
  const esquecidosHoje = pendencias.filter((p) => p.dia >= hoje);
  const { hash } = useLocation();

  // Veio do aviso de pendências (Pedidos): leva até a lista.
  useEffect(() => {
    if (hash === '#pendencias' && !carregandoAnteriores) {
      document.getElementById('pendencias')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [hash, carregandoAnteriores]);
  const contadores = carregando
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

      <ResolverPendencias
        pedidos={anteriores}
        taxa={taxaDoNegocio(perfil)}
        titulo="Pendências do dia anterior"
        descricao="Pedidos de dias anteriores que ficaram sem entregar ou sem receber. Nada foi cancelado sozinho: diga o que aconteceu com cada um. O caixa daquele dia fica como não fechado até resolver."
        idTitulo="pendencias"
        mostrarDia
        comDevolucoes
      />

      {esquecidosHoje.length > 0 && (
        <section
          aria-labelledby="titulo-pendencias"
          className="mb-8 rounded-2xl border-2 border-[var(--color-brand-orange)] p-4 sm:p-5 flex flex-col gap-4"
        >
          <div className="flex items-start gap-3">
            <AlertIcon className="w-6 h-6 shrink-0 text-[var(--texto-laranja)]" />
            <div>
              <h2 id="titulo-pendencias" className="text-lg font-bold text-[var(--text-primary)]">
                {esquecidosHoje.length === 1 ? '1 pedido pronto há mais de 2 horas' : `${esquecidosHoje.length} pedidos prontos há mais de 2 horas`}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">Ninguém marcou como entregue. Diga o que aconteceu com cada um.</p>
            </div>
          </div>
          {erro && <Aviso>{erro}</Aviso>}
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {esquecidosHoje.map((p) => (
              <Pendencia key={p.id} pedido={p} onErro={setErro} />
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="Atalhos">
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map(({ key, label, description, route, icon: Icon, accent }) => (
            <li key={key}>
              <Link to={route} className={`${classeCartao} h-full p-6`}>
                <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl shrink-0" style={{ backgroundColor: accent }}>
                  <Icon className="w-7 h-7 text-[var(--sobre-destaque)]" />
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-lg text-[var(--text-primary)]">{label}</span>
                    {contadores[key] && (
                      <Etiqueta cor={accent} className="tabular-nums">
                        {contadores[key]}
                      </Etiqueta>
                    )}
                  </span>
                  <span className="text-sm text-[var(--text-secondary)] mt-0.5">{description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Só mesa: não tem número para acompanhar, então não tem QR code. */}
        {atendeNoBalcao(modoDoNegocio(perfil)) && (
          <Link to="/pagina-do-cliente" className={`${classeCartao} mt-4 w-full p-5`}>
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl shrink-0 bg-[var(--color-brand-orange)]">
              <QrIcon className="w-6 h-6 text-[var(--sobre-destaque)]" />
            </span>
            <span className="flex flex-col">
              <span className="font-semibold text-[var(--text-primary)]">Página do cliente</span>
              <span className="text-sm text-[var(--text-secondary)]">QR code para o cliente acompanhar o pedido</span>
            </span>
          </Link>
        )}
      </nav>
    </AppShell>
  );
}
