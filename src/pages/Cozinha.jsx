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
import { KitchenIcon, BoxIcon, MonitorIcon, WifiOffIcon } from '../components/icons/AppIcons';
import { usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { useAgora } from '../hooks/useAgora';
import { useTelaAcesa } from '../hooks/useTelaAcesa';
import { useAbaNoEndereco } from '../hooks/useAbaNoEndereco';
import { useAlertaSonoro } from '../hooks/useAlertaSonoro';
import { rolarAtePedido, useFimDoCabecalho, useNovosForaDaTela } from '../hooks/useNovosForaDaTela';
import { OPCOES_DE_FOCO, dividirFila, lerFoco, somDaMudanca } from '../lib/somDaCozinha';
import { atualizarStatusPedido, marcarIngredienteFaltou, marcarItemFaltou } from '../services/pedidos';
import { liberarAudio, tocarAlerta } from '../lib/alertaSonoro';
import { chamadaDoPedido, minutosDesde } from '../lib/formatadores';
import { DESFAZER_PRONTO_SEGUNDOS, LIMITE_ATRASO_MINUTOS } from '../lib/pedidoStatus';
import { separarPedidos } from '../lib/fila';
import { useAuth } from '../context/useAuth';
import { ouvirTesteDaCozinha } from '../services/testeCozinha';

const ACCENT = 'var(--color-accent-cozinha)';

const ABAS = [
  { id: 'pedidos', rotulo: 'Pedidos', Icone: KitchenIcon },
  { id: 'esgotados', rotulo: 'Esgotados', Icone: BoxIcon },
];

const CHAVE_SOM_ALTO = 'organiza-som-alto';
const CHAVE_FOCO = 'organiza-cozinha-foco';

function lerGuardado(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // fica só nesta tela
  }
}

// Celular ou tablet (tela de toque): o som para quando outro app fica na frente.
function ehAparelhoDeToque() {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

// Som da cozinha: o navegador só libera depois de um toque na tela. Até lá,
// um botão grande pede o toque (sem ele o aviso ficaria mudo sem ninguém
// saber). Depois, os ajustes (som normal ou bem alto, testar, quantos pedidos
// na tela) ficam fechados em "Som e tela": no celular, a fila aparece sem
// rolar. O volume quem manda é o aparelho: a tela lembra disso.
function ControleDeSom({ bloqueado, alto, toque, foco, onLigar, onAlternarAlto, onMudarFoco }) {
  const [aberto, setAberto] = useState(false);
  const lembrete = (
    <p className="text-sm text-[var(--text-secondary)]">
      O volume é o do aparelho: tire do silencioso e deixe o volume alto.
      {toque && ' Deixe este aparelho só com o Organiza+ aberto: com outro app na frente, o som não toca.'}
    </p>
  );

  if (bloqueado) {
    return (
      <div className="mb-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={onLigar}
          className="w-full min-h-14 rounded-2xl px-4 text-lg font-bold text-[var(--sobre-destaque)]"
          style={{ backgroundColor: 'var(--color-brand-orange)' }}
        >
          Toque aqui para ligar o som dos pedidos novos
        </button>
        {lembrete}
      </div>
    );
  }
  return (
    <div className="mb-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[var(--text-secondary)]">
          Som ligado{alto ? ' (bem alto)' : ''}
          {foco > 0 && ` · ${foco} por vez`}
        </span>
        <Botao variante="secundaria" aria-expanded={aberto} aria-controls="ajustes-da-cozinha" onClick={() => setAberto((a) => !a)}>
          {aberto ? 'Fechar ajustes' : 'Som e tela'}
        </Botao>
      </div>
      {aberto && (
        <div id="ajustes-da-cozinha" className="mt-3 flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Botao variante="secundaria" onClick={onAlternarAlto} aria-pressed={alto}>
              {alto ? 'Som bem alto' : 'Som normal'}
            </Botao>
            <Botao variante="texto" onClick={() => tocarAlerta('novo', { alto })}>
              Testar som
            </Botao>
          </div>
          {lembrete}
          <EscolhaDoFoco foco={foco} onMudar={onMudarFoco} />
        </div>
      )}
    </div>
  );
}

// Modo foco: a cozinha escolhe ver 1, 2 ou 3 pedidos por vez, em cartões
// grandes. "Todos" é o padrão.
function EscolhaDoFoco({ foco, onMudar }) {
  return (
    <div role="group" aria-label="Pedidos na tela" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-[var(--text-secondary)]">Pedidos na tela:</span>
      {OPCOES_DE_FOCO.map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={foco === n}
          onClick={() => onMudar(n)}
          className="min-h-11 rounded-lg border px-3 font-semibold transition-colors"
          style={
            foco === n
              ? { backgroundColor: ACCENT, borderColor: ACCENT, color: 'var(--sobre-destaque)' }
              : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }
          }
        >
          {n ? `${n} por vez` : 'Todos'}
        </button>
      ))}
    </div>
  );
}

// O que mudou desde a última lista: pedido novo, pedido alterado e pedido
// cancelado merecem anúncio para leitor de tela. novos: ids dos pedidos que
// chegaram; outra: teve pedido alterado ou cancelado.
function novidades(antes, fila, cancelados) {
  const frases = [];
  const novos = [];
  let outra = false;
  for (const p of fila) {
    const anterior = antes.fila.get(p.id);
    // Pedido que volta para a fila ("Desfazer" do pronto) não é novo.
    if (!antes.vistos.has(p.id)) {
      novos.push(p.id);
      frases.push(`Pedido novo: ${chamadaDoPedido(p)}`);
    } else if (anterior !== undefined && anterior !== (p.alterado_em ?? '')) {
      outra = true;
      frases.push(`Pedido ${chamadaDoPedido(p)} alterado`);
    }
  }
  for (const p of cancelados) {
    if (!antes.cancelados.has(p.id)) {
      outra = true;
      frases.push(`Pedido ${chamadaDoPedido(p)} cancelado. Não preparar`);
    }
  }
  return { frases, novos, outra };
}

function retrato(fila, cancelados, vistosAntes = []) {
  return {
    fila: new Map(fila.map((p) => [p.id, p.alterado_em ?? ''])),
    cancelados: new Set(cancelados.map((p) => p.id)),
    vistos: new Set([...vistosAntes, ...fila.map((p) => p.id), ...cancelados.map((p) => p.id)]),
  };
}

export default function Cozinha() {
  const { pedidos, carregando, erro: erroCarga, recarregar, conectado } = usePedidosAbertos();
  const { perfil } = useAuth();
  const [somAlto, setSomAlto] = useState(() => lerGuardado(CHAVE_SOM_ALTO) === 'sim');
  const [foco, setFoco] = useState(() => lerFoco(lerGuardado(CHAVE_FOCO)));
  const [toque] = useState(ehAparelhoDeToque);
  // Pedidos que chegaram com outro app na frente (o som pode não ter tocado).
  const [chegaramEscondido, setChegaramEscondido] = useState(0);
  // "Testar agora" do guia da cozinha: aviso sem pedido de verdade.
  const [testeRecebido, setTesteRecebido] = useState(false);
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
  const somAltoRef = useRef(somAlto);
  // Quando tocou o último "tic" (no máximo um a cada 30 s).
  const ultimoTic = useRef(null);
  const topo = useFimDoCabecalho();

  useEffect(() => {
    somAltoRef.current = somAlto;
  }, [somAlto]);

  function alternarSomAlto() {
    const novo = !somAlto;
    setSomAlto(novo);
    guardar(CHAVE_SOM_ALTO, novo ? 'sim' : 'nao');
    tocarAlerta('novo', { alto: novo });
  }

  function mudarFoco(n) {
    setFoco(n);
    guardar(CHAVE_FOCO, String(n));
  }

  // O toque no botão já libera o som (useAlertaSonoro escuta os toques);
  // o teste confirma para a cozinha que está funcionando.
  async function ligarSom() {
    if (await liberarAudio()) tocarAlerta('novo', { alto: somAlto });
  }

  const { fila, cancelados } = separarPedidos(pedidos, new Date(agora));
  const canceladosParaVer = cancelados.filter((p) => !ciente.has(p.id));
  const atrasados = fila.filter((p) => minutosDesde(p.criado_em, agora) >= LIMITE_ATRASO_MINUTOS).length;
  // "+N pedidos novos": só os que estão na tela (no modo foco, o resto da fila
  // é contado à parte). O monitor respeita o mesmo modo foco deste aparelho.
  const { naoVistos, foraDaTela, marcarNovos } = useNovosForaDaTela(
    dividirFila(fila, foco).mostrados.map((p) => p.id),
    topo,
  );
  const { mostrados, escondidos, novosEscondidos } = dividirFila(fila, foco, naoVistos);

  useEffect(() => {
    if (carregando) return;
    const atual = separarPedidos(pedidos);
    const antes = ultimoRetrato.current;
    ultimoRetrato.current = retrato(atual.fila, atual.cancelados, antes?.vistos);
    // Na primeira carga não há "novidade": é só a fila como estava.
    if (!antes) return;
    const { frases, novos, outra } = novidades(antes, atual.fila, atual.cancelados);
    if (!frases.length) return;
    const agoraMs = Date.now();
    const som = somDaMudanca({
      chegouNovo: novos.length > 0,
      filaAntes: antes.fila.size,
      outraNovidade: outra,
      ultimoTic: ultimoTic.current,
      agora: agoraMs,
    });
    if (som) tocarAlerta(som, { alto: somAltoRef.current });
    if (som === 'tic') ultimoTic.current = agoraMs;
    marcarNovos(novos);
    if (novos.length && document.visibilityState === 'hidden') setChegaramEscondido((n) => n + novos.length);
    setAnuncio(frases.join('. '));
  }, [pedidos, carregando, marcarNovos]);

  useEffect(
    () =>
      ouvirTesteDaCozinha(perfil.negocio_id, () => {
        setTesteRecebido(true);
        tocarAlerta('novo', { alto: somAltoRef.current });
      }),
    [perfil.negocio_id],
  );

  useEffect(() => {
    if (!testeRecebido) return undefined;
    const id = setTimeout(() => setTesteRecebido(false), 15000);
    return () => clearTimeout(id);
  }, [testeRecebido]);

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
      // Sem som: foi o próprio cozinheiro que tocou, o som não avisaria nada.
      await atualizarStatusPedido(pedido.id, 'pronto');
      setUltimoPronto(pedido);
      recarregar();
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
      recarregar();
    } catch (e) {
      setErro(e.message);
    }
    setUltimoPronto(null);
  }

  async function alternarFaltou(item) {
    setErro('');
    try {
      await marcarItemFaltou(item.id, !item.faltou);
      recarregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function alternarIngrediente(item, ingrediente) {
    setErro('');
    try {
      await marcarIngredienteFaltou(item.id, ingrediente.id, !item.faltou_ingredientes.includes(ingrediente.nome));
      recarregar();
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
      {testeRecebido && (
        <Aviso tipo="sucesso" className="mb-4">
          Teste recebido! Está tudo certo: os pedidos vão aparecer aqui.
          {som.bloqueado && ' Toque no aviso laranja para ligar o som.'}
        </Aviso>
      )}
      {chegaramEscondido > 0 && (
        <Aviso tipo="info" className="mb-4">
          {chegaramEscondido === 1 ? 'Chegou 1 pedido' : `Chegaram ${chegaramEscondido} pedidos`} enquanto outro app estava na
          frente: o som pode não ter tocado. Deixe este aparelho só com o Organiza+ aberto.{' '}
          <button type="button" onClick={() => setChegaramEscondido(0)} className="min-h-11 font-bold underline">
            Entendi
          </button>
        </Aviso>
      )}
      <ControleDeSom
        bloqueado={som.bloqueado}
        alto={somAlto}
        toque={toque}
        foco={foco}
        onLigar={ligarSom}
        onAlternarAlto={alternarSomAlto}
        onMudarFoco={mudarFoco}
      />
      {!conectado && (
        <p
          role="status"
          className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold text-[var(--text-primary)]"
          style={{ borderColor: 'var(--color-brand-orange)' }}
        >
          <WifiOffIcon className="w-5 h-5 shrink-0 text-[var(--texto-laranja)]" />
          Reconectando. Enquanto isso, a fila é conferida a cada 8 segundos.
        </p>
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

      {/* Pedido novo fora da tela (rolou para cima, ou celular pequeno): a faixa
          fica fixa logo abaixo do cabeçalho e leva até ele. */}
      {foraDaTela.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4" style={{ top: topo + 8 }}>
          <button
            type="button"
            onClick={() => rolarAtePedido(foraDaTela[0], topo)}
            className="pointer-events-auto min-h-12 rounded-full px-5 text-base font-bold shadow-lg text-[var(--sobre-destaque)]"
            style={{ backgroundColor: 'var(--color-accent-pedidos)' }}
          >
            +{foraDaTela.length} {foraDaTela.length === 1 ? 'pedido novo' : 'pedidos novos'}
          </button>
        </div>
      )}

      {escondidos > 0 && (
        <p className="mb-4 rounded-xl border-2 border-[var(--border-subtle)] px-4 py-3 text-lg font-bold text-[var(--text-primary)]">
          +{escondidos} na fila
          {novosEscondidos > 0 && <span className="text-[var(--texto-pedidos)]"> ({novosEscondidos === 1 ? '1 novo' : `${novosEscondidos} novos`})</span>}
          <span className="block text-sm font-medium text-[var(--text-secondary)]">Toque em Pronto e o próximo aparece.</span>
        </p>
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
          className={`grid grid-cols-1 gap-4 ${
            foco === 1
              ? 'max-w-3xl mx-auto'
              : foco === 2
                ? 'md:grid-cols-2'
                : `md:grid-cols-2 xl:grid-cols-3 ${monitor && !foco ? '2xl:grid-cols-4' : ''}`
          }`}
        >
          {mostrados.map((p, i) => (
            <CartaoFila
              key={p.id}
              pedido={p}
              posicao={i + 1}
              agora={agora}
              grande={foco > 0}
              onPronto={marcarPronto}
              onFaltou={alternarFaltou}
              onFaltouIngrediente={alternarIngrediente}
            />
          ))}
        </ul>
      )}

      {ultimoPronto && (
        <>
          {/* No monitor não há rodapé: o espaço fica aqui. Fora dele, o AppShell reserva. */}
          {monitor && <div className="h-20" aria-hidden="true" />}
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
    <AppShell largura="max-w-6xl" reservaNoFim={ultimoPronto ? 'h-20' : ''}>
      {/* Tablet deitado (1024×600): sem o cabeçalho grande, o "Pronto" cabe sem rolar. */}
      <div className="[@media(max-height:700px)]:hidden">
        <PageHeader icon={KitchenIcon} accent={ACCENT} title="Cozinha" subtitle="Do mais antigo para o mais novo" />
      </div>

      {anuncioParaLeitor}

      <div className="mb-4 flex flex-wrap items-center gap-3 [@media(max-height:700px)]:mb-3">
        <Abas opcoes={ABAS} valor={aba} onMudar={setAba} cor={ACCENT} rotulo="O que mostrar" />
        <Botao variante="secundaria" para="/cozinha?modo=monitor" className="ml-auto">
          <MonitorIcon className="w-5 h-5" />
          Modo monitor
        </Botao>
      </div>

      {avisos}

      {aba === 'esgotados' ? (
        <ListaEsgotados onErro={setErro} />
      ) : (
        <>
          {!carregando && (
            <dl className="grid grid-cols-2 gap-3 mb-6 [@media(max-height:700px)]:hidden">
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
