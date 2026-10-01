import { useEffect, useRef, useState } from 'react';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import { KitchenIcon, ClockIcon, AlertIcon, BoxIcon, CheckIcon, CloseIcon } from '../components/icons/AppIcons';
import { usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { useProdutos } from '../hooks/useProdutos';
import { useAgora } from '../hooks/useAgora';
import { useTelaAcesa } from '../hooks/useTelaAcesa';
import { atualizarStatusPedido, marcarItemFaltou } from '../services/pedidos';
import { atualizarProduto } from '../services/produtos';
import { formatarEspera, formatarHora, minutosDesde, numeroDoPedido } from '../lib/formatadores';
import { DESFAZER_PRONTO_SEGUNDOS, LIMITE_ATRASO_MINUTOS, rotuloDoMotivo } from '../lib/pedidoStatus';
import { separarPedidos } from '../lib/fila';

const ACCENT = 'var(--color-accent-cozinha)';
const VERDE = 'var(--color-accent-relatorios)';

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

function ItemDaFila({ item, onFaltou }) {
  return (
    <li className="flex items-start gap-3 text-lg">
      <span
        className="font-extrabold min-w-10 text-[var(--text-primary)]"
        style={{ textDecoration: item.faltou ? 'line-through' : 'none' }}
      >
        {item.quantidade}×
      </span>
      <span className="flex-1 min-w-0">
        <span
          className="block font-medium text-[var(--text-primary)] break-words"
          style={{ textDecoration: item.faltou ? 'line-through' : 'none' }}
        >
          {item.nome}
        </span>
        {item.observacao && (
          <span className="mt-1 inline-block rounded-r-lg border-l-4 border-[var(--color-brand-orange)] px-2.5 py-1 text-base font-bold break-words bg-[color-mix(in_srgb,var(--color-brand-orange)_18%,transparent)] text-[var(--text-primary)]">
            {item.observacao}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => onFaltou(item)}
        aria-pressed={item.faltou}
        className="shrink-0 min-h-10 rounded-lg px-3 py-2 text-sm font-bold border"
        style={
          item.faltou
            ? { backgroundColor: ACCENT, borderColor: ACCENT, color: '#FFFFFF' }
            : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }
        }
        title={item.faltou ? 'Toque para desfazer o aviso' : 'Avisar o atendente que não tem como fazer'}
      >
        Faltou
      </button>
    </li>
  );
}

function CartaoFila({ pedido, agora, onPronto, onFaltou }) {
  const [salvando, setSalvando] = useState(false);
  const minutos = minutosDesde(pedido.criado_em, agora);
  const atrasado = minutos >= LIMITE_ATRASO_MINUTOS;
  const alterado = Boolean(pedido.alterado_em);
  const borda = atrasado ? ACCENT : alterado ? 'var(--color-brand-orange)' : 'var(--color-accent-pedidos)';

  async function marcarPronto() {
    setSalvando(true);
    const deuCerto = await onPronto(pedido);
    if (!deuCerto) setSalvando(false);
  }

  return (
    <li className="rounded-2xl border-2 bg-[var(--surface-card)] p-4 sm:p-5 flex flex-col gap-4" style={{ borderColor: borda }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-3xl font-extrabold tracking-wide text-[var(--text-primary)]">{numeroDoPedido(pedido)}</span>
        {alterado && (
          <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full text-white bg-[var(--color-brand-orange)]">
            Alterado às {formatarHora(pedido.alterado_em)}
          </span>
        )}
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

      <ul className="flex flex-col gap-3">
        {pedido.itens.map((item) => (
          <ItemDaFila key={item.id} item={item} onFaltou={onFaltou} />
        ))}
      </ul>

      <button
        type="button"
        onClick={marcarPronto}
        disabled={salvando}
        className="mt-auto w-full inline-flex items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold text-white transition hover:brightness-110 disabled:opacity-60"
        style={{ backgroundColor: VERDE }}
      >
        <CheckIcon className="w-6 h-6" />
        {salvando ? 'Salvando...' : 'Pronto'}
      </button>
    </li>
  );
}

function CartaoCancelado({ pedido, onOk }) {
  return (
    <li
      className="rounded-2xl border-2 p-4 sm:p-5 flex flex-col gap-3 bg-[color-mix(in_srgb,var(--color-accent-cozinha)_12%,var(--surface-card))]"
      style={{ borderColor: ACCENT }}
      role="alert"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl font-extrabold tracking-wide text-[var(--text-primary)] line-through">
          {numeroDoPedido(pedido)}
        </span>
        <span className="text-sm font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: ACCENT }}>
          Cancelado
        </span>
      </div>
      <p className="text-lg font-bold" style={{ color: ACCENT }}>
        Não preparar. {rotuloDoMotivo(pedido.motivo_cancelamento)}.
      </p>
      <p className="text-sm text-[var(--text-secondary)] line-through break-words">
        {pedido.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}
      </p>
      <button
        type="button"
        onClick={onOk}
        className="self-start inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-[var(--border-subtle)] text-[var(--text-primary)]"
      >
        <CloseIcon className="w-4 h-4" />
        Ok, entendi
      </button>
    </li>
  );
}

function BarraDesfazer({ pedido, onDesfazer }) {
  const [desfazendo, setDesfazendo] = useState(false);

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-4 z-30 px-4">
      <div className="max-w-md mx-auto flex items-center gap-3 rounded-2xl bg-[var(--surface-alt)] border border-[var(--border-subtle)] shadow-lg p-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-white shrink-0" style={{ backgroundColor: VERDE }}>
          <CheckIcon className="w-5 h-5" />
        </span>
        <p className="flex-1 font-semibold text-[var(--text-primary)]">Pedido {numeroDoPedido(pedido)} pronto</p>
        <button
          type="button"
          disabled={desfazendo}
          onClick={async () => {
            setDesfazendo(true);
            await onDesfazer(pedido);
          }}
          className="rounded-xl px-4 py-2.5 text-sm font-bold border border-[var(--border-subtle)] text-[var(--text-primary)] disabled:opacity-60"
        >
          Desfazer
        </button>
      </div>
    </div>
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
                style={{ backgroundColor: p.disponivel ? VERDE : ACCENT }}
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

// Muda quando chega pedido, quando um pedido da fila é alterado ou quando um
// é cancelado: os três merecem o bipe.
function assinaturaParaAviso(fila, cancelados) {
  return [...fila.map((p) => `${p.id}:${p.alterado_em ?? ''}`), ...cancelados.map((p) => `x${p.id}`)];
}

export default function Cozinha() {
  const { pedidos, carregando, erro: erroCarga } = usePedidosAbertos();
  const agora = useAgora();
  useTelaAcesa();
  const [aba, setAba] = useState('pedidos');
  const [erro, setErro] = useState('');
  const [ciente, setCiente] = useState(() => new Set());
  const [ultimoPronto, setUltimoPronto] = useState(null);
  const avisosAntes = useRef(null);

  const { fila, cancelados } = separarPedidos(pedidos, new Date(agora));
  const canceladosParaVer = cancelados.filter((p) => !ciente.has(p.id));
  const atrasados = fila.filter((p) => minutosDesde(p.criado_em, agora) >= LIMITE_ATRASO_MINUTOS).length;

  const assinatura = assinaturaParaAviso(fila, cancelados);
  const chaveAviso = assinatura.join('|');
  useEffect(() => {
    if (carregando) return;
    const antes = avisosAntes.current;
    const atual = chaveAviso ? chaveAviso.split('|') : [];
    if (antes && atual.some((a) => !antes.has(a))) tocarAviso();
    avisosAntes.current = new Set(atual);
  }, [chaveAviso, carregando]);

  useEffect(() => {
    const original = document.title;
    document.title = fila.length ? `(${fila.length}) Cozinha · Organiza+` : 'Cozinha · Organiza+';
    return () => {
      document.title = original;
    };
  }, [fila.length]);

  useEffect(() => {
    if (!ultimoPronto) return undefined;
    const id = setTimeout(() => setUltimoPronto(null), DESFAZER_PRONTO_SEGUNDOS * 1000);
    return () => clearTimeout(id);
  }, [ultimoPronto]);

  async function marcarPronto(pedido) {
    setErro('');
    try {
      await atualizarStatusPedido(pedido.id, 'pronto');
      setUltimoPronto(pedido);
      return true;
    } catch (e) {
      setErro(e.message);
      return false;
    }
  }

  async function desfazer(pedido) {
    setErro('');
    try {
      await atualizarStatusPedido(pedido.id, 'pendente');
    } catch (e) {
      setErro(e.message);
    }
    setUltimoPronto(null);
  }

  async function alternarFaltou(item) {
    setErro('');
    try {
      await marcarItemFaltou(item.id, !item.faltou);
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <AppShell largura="max-w-6xl">
      <PageHeader icon={KitchenIcon} accent={ACCENT} title="Cozinha" subtitle="Do mais antigo para o mais novo" />

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

      {aba === 'esgotados' ? (
        <ListaEsgotados onErro={setErro} />
      ) : carregando ? (
        <Carregando texto="Carregando pedidos..." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { rotulo: 'Na fila', valor: fila.length, cor: 'var(--color-accent-pedidos)' },
              { rotulo: 'Atrasados', valor: atrasados, cor: ACCENT },
            ].map(({ rotulo, valor, cor }) => (
              <div key={rotulo} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 sm:p-4 text-center">
                <p className="text-3xl font-extrabold" style={{ color: valor ? cor : 'var(--text-secondary)' }}>
                  {valor}
                </p>
                <p className="text-sm font-medium text-[var(--text-secondary)]">{rotulo}</p>
              </div>
            ))}
          </div>

          {canceladosParaVer.length > 0 && (
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
              {canceladosParaVer.map((p) => (
                <CartaoCancelado key={p.id} pedido={p} onOk={() => setCiente((s) => new Set(s).add(p.id))} />
              ))}
            </ul>
          )}

          {fila.length === 0 ? (
            <EstadoVazio
              icon={KitchenIcon}
              accent={ACCENT}
              titulo="Nenhum pedido para preparar"
              texto="Quando um pedido for lançado, ele aparece aqui na hora."
            />
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {fila.map((p) => (
                <CartaoFila key={p.id} pedido={p} agora={agora} onPronto={marcarPronto} onFaltou={alternarFaltou} />
              ))}
            </ul>
          )}

          {ultimoPronto && (
            <>
              <div className="h-20" aria-hidden="true" />
              <BarraDesfazer key={ultimoPronto.id} pedido={ultimoPronto} onDesfazer={desfazer} />
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
