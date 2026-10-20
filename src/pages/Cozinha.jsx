import { useEffect, useRef, useState } from 'react';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Abas from '../components/ui/Abas';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import CartaoFila from '../components/cozinha/CartaoFila';
import CartaoCancelado from '../components/cozinha/CartaoCancelado';
import BarraDesfazer from '../components/cozinha/BarraDesfazer';
import ListaEsgotados from '../components/cozinha/ListaEsgotados';
import { KitchenIcon, BoxIcon } from '../components/icons/AppIcons';
import { usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { useAgora } from '../hooks/useAgora';
import { useTelaAcesa } from '../hooks/useTelaAcesa';
import { useAbaNoEndereco } from '../hooks/useAbaNoEndereco';
import { atualizarStatusPedido, marcarItemFaltou } from '../services/pedidos';
import { minutosDesde, numeroDoPedido } from '../lib/formatadores';
import { DESFAZER_PRONTO_SEGUNDOS, LIMITE_ATRASO_MINUTOS } from '../lib/pedidoStatus';
import { separarPedidos } from '../lib/fila';

const ACCENT = 'var(--color-accent-cozinha)';

const ABAS = [
  { id: 'pedidos', rotulo: 'Pedidos', Icone: KitchenIcon },
  { id: 'esgotados', rotulo: 'Esgotados', Icone: BoxIcon },
];

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

// O que mudou desde a última lista: pedido novo, pedido alterado e pedido
// cancelado merecem bipe e anúncio para leitor de tela.
function novidades(antes, fila, cancelados) {
  const frases = [];
  for (const p of fila) {
    const anterior = antes.fila.get(p.id);
    // Pedido que volta para a fila ("Desfazer" do pronto) não é novo.
    if (!antes.vistos.has(p.id)) frases.push(`Pedido novo: ${numeroDoPedido(p)}`);
    else if (anterior !== undefined && anterior !== (p.alterado_em ?? '')) frases.push(`Pedido ${numeroDoPedido(p)} alterado`);
  }
  for (const p of cancelados) {
    if (!antes.cancelados.has(p.id)) frases.push(`Pedido ${numeroDoPedido(p)} cancelado. Não preparar`);
  }
  return frases;
}

function retrato(fila, cancelados, vistosAntes = []) {
  return {
    fila: new Map(fila.map((p) => [p.id, p.alterado_em ?? ''])),
    cancelados: new Set(cancelados.map((p) => p.id)),
    vistos: new Set([...vistosAntes, ...fila.map((p) => p.id), ...cancelados.map((p) => p.id)]),
  };
}

export default function Cozinha() {
  const { pedidos, carregando, erro: erroCarga } = usePedidosAbertos();
  const agora = useAgora();
  useTelaAcesa();
  const [aba, setAba] = useAbaNoEndereco('aba', ABAS, 'pedidos');
  const [erro, setErro] = useState('');
  const [ciente, setCiente] = useState(() => new Set());
  const [ultimoPronto, setUltimoPronto] = useState(null);
  const [anuncio, setAnuncio] = useState('');
  const ultimoRetrato = useRef(null);

  const { fila, cancelados } = separarPedidos(pedidos, new Date(agora));
  const canceladosParaVer = cancelados.filter((p) => !ciente.has(p.id));
  const atrasados = fila.filter((p) => minutosDesde(p.criado_em, agora) >= LIMITE_ATRASO_MINUTOS).length;

  useEffect(() => {
    if (carregando) return;
    const atual = separarPedidos(pedidos);
    const antes = ultimoRetrato.current;
    ultimoRetrato.current = retrato(atual.fila, atual.cancelados, antes?.vistos);
    // Na primeira carga não há "novidade": é só a fila como estava.
    if (!antes) return;
    const frases = novidades(antes, atual.fila, atual.cancelados);
    if (frases.length) {
      tocarAviso();
      setAnuncio(frases.join('. '));
    }
  }, [pedidos, carregando]);

  useEffect(() => {
    const original = document.title;
    document.title = fila.length ? `(${fila.length}) Cozinha | Organiza+` : 'Cozinha | Organiza+';
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

      <p aria-live="assertive" className="sr-only">
        {anuncio}
      </p>

      <div className="mb-6">
        <Abas opcoes={ABAS} valor={aba} onMudar={setAba} cor={ACCENT} rotulo="O que mostrar" />
      </div>

      {(erro || erroCarga) && <Aviso className="mb-4">{erro || erroCarga}</Aviso>}

      {aba === 'esgotados' ? (
        <ListaEsgotados onErro={setErro} />
      ) : carregando ? (
        <Carregando texto="Carregando pedidos…" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 mb-6">
            {[
              { rotulo: 'Na fila', valor: fila.length, cor: 'var(--texto-pedidos)' },
              { rotulo: 'Atrasados', valor: atrasados, cor: 'var(--texto-cozinha)' },
            ].map(({ rotulo, valor, cor }) => (
              <div
                key={rotulo}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 sm:p-4 text-center flex flex-col-reverse"
              >
                <dt className="text-sm font-medium text-[var(--text-secondary)]">{rotulo}</dt>
                <dd className="text-3xl font-extrabold tabular-nums" style={{ color: valor ? cor : 'var(--text-secondary)' }}>
                  {valor}
                </dd>
              </div>
            ))}
          </dl>

          {canceladosParaVer.length > 0 && (
            <ul aria-label="Pedidos cancelados" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
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
            <ul aria-label="Fila de pedidos" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
