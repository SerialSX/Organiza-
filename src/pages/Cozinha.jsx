import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Abas from '../components/ui/Abas';
import Botao from '../components/ui/Botao';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import CartaoFila from '../components/cozinha/CartaoFila';
import CartaoCancelado from '../components/cozinha/CartaoCancelado';
import BarraDesfazer from '../components/cozinha/BarraDesfazer';
import ListaEsgotados from '../components/cozinha/ListaEsgotados';
import MolduraMonitor from '../components/cozinha/MolduraMonitor';
import { KitchenIcon, BoxIcon, MonitorIcon } from '../components/icons/AppIcons';
import { usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { useAgora } from '../hooks/useAgora';
import { useTelaAcesa } from '../hooks/useTelaAcesa';
import { useAbaNoEndereco } from '../hooks/useAbaNoEndereco';
import { useAlertaSonoro } from '../hooks/useAlertaSonoro';
import { atualizarStatusPedido, marcarIngredienteFaltou, marcarItemFaltou } from '../services/pedidos';
import { tocarAlerta } from '../lib/alertaSonoro';
import { chamadaDoPedido, minutosDesde } from '../lib/formatadores';
import { DESFAZER_PRONTO_SEGUNDOS, LIMITE_ATRASO_MINUTOS } from '../lib/pedidoStatus';
import { separarPedidos } from '../lib/fila';

const ACCENT = 'var(--color-accent-cozinha)';

const ABAS = [
  { id: 'pedidos', rotulo: 'Pedidos', Icone: KitchenIcon },
  { id: 'esgotados', rotulo: 'Esgotados', Icone: BoxIcon },
];

// O que mudou desde a última lista: pedido novo, pedido alterado e pedido
// cancelado merecem som e anúncio para leitor de tela. novo: chegou pedido
// novo, que tem o som mais chamativo.
function novidades(antes, fila, cancelados) {
  const frases = [];
  let novo = false;
  for (const p of fila) {
    const anterior = antes.fila.get(p.id);
    // Pedido que volta para a fila ("Desfazer" do pronto) não é novo.
    if (!antes.vistos.has(p.id)) {
      novo = true;
      frases.push(`Pedido novo: ${chamadaDoPedido(p)}`);
    } else if (anterior !== undefined && anterior !== (p.alterado_em ?? '')) frases.push(`Pedido ${chamadaDoPedido(p)} alterado`);
  }
  for (const p of cancelados) {
    if (!antes.cancelados.has(p.id)) frases.push(`Pedido ${chamadaDoPedido(p)} cancelado. Não preparar`);
  }
  return { frases, novo };
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
  const som = useAlertaSonoro();
  // Modo monitor (?modo=monitor): a fila numa TV ou tablet da cozinha, sem o
  // menu do sistema e com alto contraste.
  const [busca] = useSearchParams();
  const monitor = busca.get('modo') === 'monitor';
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
    const { frases, novo } = novidades(antes, atual.fila, atual.cancelados);
    if (frases.length) {
      tocarAlerta(novo ? 'novo' : 'aviso');
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
      tocarAlerta('pronto');
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

  async function alternarIngrediente(item, ingrediente) {
    setErro('');
    try {
      await marcarIngredienteFaltou(item.id, ingrediente.id, !item.faltou_ingredientes.includes(ingrediente.nome));
    } catch (e) {
      setErro(e.message);
    }
  }

  const anuncioParaLeitor = (
    <p aria-live="assertive" className="sr-only">
      {anuncio}
    </p>
  );

  const avisos = (
    <>
      {som.bloqueado && (
        <Aviso tipo="info" className="mb-4">
          Toque em qualquer lugar da tela para ativar o som dos pedidos.
        </Aviso>
      )}
      {(erro || erroCarga) && <Aviso className="mb-4">{erro || erroCarga}</Aviso>}
    </>
  );

  // Fila em ordem de chegada (o mais antigo primeiro), com a posição de cada um.
  const listaDePedidos = carregando ? (
    <Carregando texto="Carregando pedidos…" />
  ) : (
    <>
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
        <ul
          aria-label="Fila de pedidos"
          className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 ${monitor ? '2xl:grid-cols-4' : ''}`}
        >
          {fila.map((p, i) => (
            <CartaoFila
              key={p.id}
              pedido={p}
              posicao={i + 1}
              agora={agora}
              onPronto={marcarPronto}
              onFaltou={alternarFaltou}
              onFaltouIngrediente={alternarIngrediente}
            />
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
  );

  if (monitor) {
    return (
      <MolduraMonitor naFila={fila.length} atrasados={atrasados}>
        {anuncioParaLeitor}
        {avisos}
        {listaDePedidos}
      </MolduraMonitor>
    );
  }

  return (
    <AppShell largura="max-w-6xl">
      <PageHeader icon={KitchenIcon} accent={ACCENT} title="Cozinha" subtitle="Do mais antigo para o mais novo">
        <Botao variante="secundaria" para="/cozinha?modo=monitor">
          <MonitorIcon className="w-5 h-5" />
          Modo monitor
        </Botao>
      </PageHeader>

      {anuncioParaLeitor}

      <div className="mb-6">
        <Abas opcoes={ABAS} valor={aba} onMudar={setAba} cor={ACCENT} rotulo="O que mostrar" />
      </div>

      {avisos}

      {aba === 'esgotados' ? (
        <ListaEsgotados onErro={setErro} />
      ) : (
        <>
          {!carregando && (
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
          )}
          {listaDePedidos}
        </>
      )}
    </AppShell>
  );
}
