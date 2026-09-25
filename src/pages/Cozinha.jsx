import { useEffect, useRef, useState } from 'react';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import { KitchenIcon, ClockIcon, AlertIcon, BoxIcon } from '../components/icons/AppIcons';
import { usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { useProdutos } from '../hooks/useProdutos';
import { useAgora } from '../hooks/useAgora';
import { useTelaAcesa } from '../hooks/useTelaAcesa';
import { atualizarStatusPedido } from '../services/pedidos';
import { atualizarProduto } from '../services/produtos';
import { codigoPedido, formatarEspera, formatarHora, minutosDesde } from '../lib/formatadores';
import { STATUS, LIMITE_ATRASO_MINUTOS } from '../lib/pedidoStatus';

const ACCENT = 'var(--color-accent-cozinha)';

function tocarAviso() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const volume = ctx.createGain();
    osc.frequency.value = 880;
    volume.gain.setValueAtTime(0.15, ctx.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(volume).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch {
    // navegador sem áudio ou bloqueado antes de interação: segue sem som
  }
}

function CartaoPedido({ pedido, agora, onAvancar }) {
  const [salvando, setSalvando] = useState(false);
  const info = STATUS[pedido.status];
  const minutos = minutosDesde(pedido.criado_em, agora);
  const atrasado = pedido.status !== 'pronto' && minutos >= LIMITE_ATRASO_MINUTOS;
  const corBorda = atrasado ? ACCENT : info.cor;

  async function avancar() {
    setSalvando(true);
    await onAvancar(pedido);
    setSalvando(false);
  }

  return (
    <li
      className="rounded-2xl border-2 bg-[var(--surface-card)] p-4 sm:p-5 flex flex-col gap-4"
      style={{ borderColor: corBorda }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl font-extrabold text-[var(--text-primary)]">{codigoPedido(pedido.id)}</span>
        <span
          className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full text-white"
          style={{ backgroundColor: info.cor }}
        >
          {info.rotulo}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1.5 font-bold"
          style={{ color: atrasado ? ACCENT : 'var(--text-secondary)' }}
          title={`Chegou às ${formatarHora(pedido.criado_em)}`}
        >
          {atrasado ? <AlertIcon className="w-5 h-5" /> : <ClockIcon className="w-5 h-5" />}
          {formatarEspera(minutos)}
        </span>
      </div>

      {atrasado && (
        <p className="-mt-2 text-sm font-semibold" style={{ color: ACCENT }}>
          Atrasado: esperando há mais de {LIMITE_ATRASO_MINUTOS} minutos
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {pedido.itens.map((item) => (
          <li key={item.id} className="flex items-baseline gap-3 text-lg">
            <span className="font-extrabold min-w-10 text-[var(--text-primary)]">{item.quantidade}×</span>
            <span className="font-medium text-[var(--text-primary)] break-words">{item.nome}</span>
          </li>
        ))}
      </ul>

      {info.proximo && (
        <button
          type="button"
          onClick={avancar}
          disabled={salvando}
          className="mt-auto w-full rounded-xl py-3.5 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          style={{ backgroundColor: info.corAcao }}
        >
          {salvando ? 'Salvando...' : info.acao}
        </button>
      )}
    </li>
  );
}

function ListaPedidos({ pedidos, agora, onAvancar }) {
  const aPreparar = pedidos.filter((p) => p.status !== 'pronto');
  const prontos = pedidos.filter((p) => p.status === 'pronto');
  const atrasados = aPreparar.filter((p) => minutosDesde(p.criado_em, agora) >= LIMITE_ATRASO_MINUTOS).length;

  const contadores = [
    { rotulo: 'Novos', valor: pedidos.filter((p) => p.status === 'pendente').length, cor: STATUS.pendente.cor },
    { rotulo: 'Preparando', valor: pedidos.filter((p) => p.status === 'em_preparo').length, cor: STATUS.em_preparo.cor },
    { rotulo: 'Atrasados', valor: atrasados, cor: ACCENT },
  ];

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {contadores.map(({ rotulo, valor, cor }) => (
          <div
            key={rotulo}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 sm:p-4 text-center"
          >
            <p className="text-3xl font-extrabold" style={{ color: valor ? cor : 'var(--text-secondary)' }}>
              {valor}
            </p>
            <p className="text-xs sm:text-sm font-medium text-[var(--text-secondary)]">{rotulo}</p>
          </div>
        ))}
      </div>

      {aPreparar.length === 0 ? (
        <EstadoVazio
          icon={KitchenIcon}
          accent={ACCENT}
          titulo="Nenhum pedido para preparar"
          texto="Quando um pedido for lançado, ele aparece aqui na hora."
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {aPreparar.map((p) => (
            <CartaoPedido key={p.id} pedido={p} agora={agora} onAvancar={onAvancar} />
          ))}
        </ul>
      )}

      {prontos.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
            Prontos, esperando entrega ({prontos.length})
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {prontos.map((p) => (
              <CartaoPedido key={p.id} pedido={p} agora={agora} onAvancar={onAvancar} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ListaEsgotados({ onErro }) {
  const { produtos, carregando } = useProdutos();

  async function alternar(produto) {
    try {
      await atualizarProduto(produto.id, { disponivel: !produto.disponivel });
    } catch (e) {
      onErro(e.message);
    }
  }

  if (carregando) return <Carregando texto="Carregando produtos..." />;

  if (!produtos.length) {
    return <EstadoVazio icon={BoxIcon} accent={ACCENT} titulo="Nenhum produto cadastrado" />;
  }

  return (
    <>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Acabou algum ingrediente? Toque no produto para marcar como esgotado. A tela de pedidos bloqueia na hora.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {produtos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => alternar(p)}
              aria-pressed={!p.disponivel}
              className="w-full flex items-center gap-3 rounded-2xl border-2 bg-[var(--surface-card)] p-4 text-left transition"
              style={{ borderColor: p.disponivel ? 'var(--border-subtle)' : ACCENT }}
            >
              <span className="flex-1 min-w-0 font-semibold text-[var(--text-primary)] break-words">{p.nome}</span>
              <span
                className="shrink-0 rounded-xl px-3 py-2 text-sm font-bold text-white"
                style={{ backgroundColor: p.disponivel ? 'var(--color-accent-relatorios)' : ACCENT }}
              >
                {p.disponivel ? 'Tem' : 'Esgotado'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

const ABAS = [
  { id: 'pedidos', rotulo: 'Pedidos', Icone: KitchenIcon },
  { id: 'esgotados', rotulo: 'Esgotados', Icone: BoxIcon },
];

export default function Cozinha() {
  const { pedidos, carregando, erro: erroCarga } = usePedidosAbertos();
  const agora = useAgora();
  useTelaAcesa();
  const [aba, setAba] = useState('pedidos');
  const [erro, setErro] = useState('');
  const pendentesAntes = useRef(null);

  const pendentes = pedidos.filter((p) => p.status === 'pendente').length;

  useEffect(() => {
    if (carregando) return;
    if (pendentesAntes.current !== null && pendentes > pendentesAntes.current) tocarAviso();
    pendentesAntes.current = pendentes;
  }, [pendentes, carregando]);

  useEffect(() => {
    const original = document.title;
    document.title = pendentes ? `(${pendentes}) Cozinha · Organiza+` : 'Cozinha · Organiza+';
    return () => {
      document.title = original;
    };
  }, [pendentes]);

  async function avancar(pedido) {
    setErro('');
    try {
      await atualizarStatusPedido(pedido.id, STATUS[pedido.status].proximo);
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <AppShell largura="max-w-6xl">
      <PageHeader
        icon={KitchenIcon}
        accent={ACCENT}
        title="Cozinha"
        subtitle="Pedidos chegam aqui sozinhos, do mais antigo para o mais novo"
      />

      <div role="tablist" className="inline-flex rounded-xl border border-[var(--border-subtle)] p-1 mb-6 bg-[var(--surface-card)]">
        {ABAS.map(({ id, rotulo, Icone }) => {
          const ativa = aba === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => setAba(id)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition"
              style={{
                backgroundColor: ativa ? ACCENT : 'transparent',
                color: ativa ? '#FFFFFF' : 'var(--text-secondary)',
              }}
            >
              <Icone className="w-5 h-5" />
              {rotulo}
            </button>
          );
        })}
      </div>

      {(erro || erroCarga) && <Aviso className="mb-4">{erro || erroCarga}</Aviso>}

      {aba === 'pedidos' ? (
        carregando ? (
          <Carregando texto="Carregando pedidos..." />
        ) : (
          <ListaPedidos pedidos={pedidos} agora={agora} onAvancar={avancar} />
        )
      ) : (
        <ListaEsgotados onErro={setErro} />
      )}
    </AppShell>
  );
}
