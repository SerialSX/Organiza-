import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckIcon, AlertIcon, ClockIcon } from '../components/icons/AppIcons';
import Carregando from '../components/ui/Carregando';
import { acompanharPedido, buscarPaginaPublica, ErroPaginaPublica } from '../services/paginaPublica';
import { hojeNoNegocio } from '../lib/formatadores';

// Página aberta pelo QR code, sem cadastro. É do estabelecimento: mostra o nome
// dele e nada do Organiza+.

const INTERVALO_SEGUNDOS = 10;
const MAX_BOLINHAS = 8;
const LARANJA = 'var(--color-brand-orange)';
const VERDE = 'var(--color-accent-relatorios)';

function chaveSalva(codigo) {
  return `organiza-acompanhar:${codigo}`;
}

// O número fica guardado só neste aparelho e só vale para hoje.
function lerNumeroSalvo(codigo) {
  try {
    const salvo = JSON.parse(localStorage.getItem(chaveSalva(codigo)));
    return salvo?.dia === hojeNoNegocio() ? salvo.numero : null;
  } catch {
    return null;
  }
}

function salvarNumero(codigo, numero) {
  try {
    if (numero) localStorage.setItem(chaveSalva(codigo), JSON.stringify({ numero, dia: hojeNoNegocio() }));
    else localStorage.removeItem(chaveSalva(codigo));
  } catch {
    // sem localStorage: o cliente digita de novo se recarregar
  }
}

function avisarPronto() {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    // aparelho sem vibração
  }
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((atraso) => {
      const osc = ctx.createOscillator();
      const volume = ctx.createGain();
      osc.frequency.value = 880;
      volume.gain.setValueAtTime(0.2, ctx.currentTime + atraso);
      volume.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + atraso + 0.2);
      osc.connect(volume).connect(ctx.destination);
      osc.start(ctx.currentTime + atraso);
      osc.stop(ctx.currentTime + atraso + 0.2);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    // navegador sem áudio
  }
}

function Moldura({ nome, children }) {
  return (
    <div className="min-h-svh bg-[var(--surface)] text-[var(--text-primary)] flex flex-col">
      <header className="px-5 pt-8 pb-4 text-center">
        <h1 className="text-2xl sm:text-3xl font-extrabold break-words">{nome}</h1>
      </header>
      <main className="flex-1 w-full max-w-md mx-auto px-5 pb-10 flex flex-col">{children}</main>
    </div>
  );
}

function FormularioNumero({ erro, onEnviar }) {
  const [numero, setNumero] = useState('');
  const valido = /^\d{4}$/.test(numero);

  return (
    <form
      className="flex flex-col gap-5 mt-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (valido) onEnviar(Number(numero));
      }}
    >
      <label className="flex flex-col gap-3 text-center">
        <span className="text-lg font-semibold">Qual é o número do seu pedido?</span>
        <input
          value={numero}
          onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="0000"
          aria-label="Número do pedido"
          className="w-full text-center text-5xl font-extrabold tracking-[0.3em] rounded-2xl border-2 border-[var(--border-subtle)] bg-[var(--surface-card)] py-5 outline-none focus:border-[var(--color-brand-orange)] placeholder:text-[var(--border-subtle)]"
        />
      </label>
      {erro && (
        <p role="alert" className="text-center font-semibold" style={{ color: 'var(--color-accent-cozinha)' }}>
          {erro}
        </p>
      )}
      <button
        type="submit"
        disabled={!valido}
        className="w-full rounded-2xl py-4 text-lg font-bold text-white disabled:opacity-40"
        style={{ backgroundColor: LARANJA }}
      >
        Acompanhar
      </button>
      <p className="text-center text-sm text-[var(--text-secondary)]">O número é o que o atendente falou quando você pediu.</p>
    </form>
  );
}

// Uma bolinha por pedido na frente do cliente; a dele pulsa no fim da fila.
function Fila({ posicao }) {
  const aFrente = posicao - 1;
  const mostradas = Math.min(aFrente, MAX_BOLINHAS);

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap" aria-hidden="true">
      {aFrente > MAX_BOLINHAS && (
        <span className="text-sm font-bold text-[var(--text-secondary)] mr-1">+{aFrente - MAX_BOLINHAS}</span>
      )}
      {Array.from({ length: mostradas }, (_, i) => (
        <span key={i} className="w-4 h-4 rounded-full bg-[var(--border-subtle)]" />
      ))}
      <span className="relative inline-flex w-7 h-7">
        <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ backgroundColor: LARANJA }} />
        <span className="relative w-7 h-7 rounded-full" style={{ backgroundColor: LARANJA }} />
      </span>
    </div>
  );
}

function NaFila({ numero, situacao }) {
  const { posicao, tempo_medio_min: tempo, faltou } = situacao;

  return (
    <div className="flex flex-col gap-6 mt-6 text-center">
      <p className="text-[var(--text-secondary)] font-semibold">Pedido {numero}</p>

      {faltou && (
        <p
          role="alert"
          className="flex items-start gap-2 text-left rounded-2xl px-4 py-3 font-semibold border-2"
          style={{ borderColor: LARANJA }}
        >
          <AlertIcon className="w-6 h-6 shrink-0" style={{ color: LARANJA }} />
          Faltou um item do seu pedido. Fale com o atendente.
        </p>
      )}

      <div className="rounded-3xl bg-[var(--surface-card)] border border-[var(--border-subtle)] px-5 py-8 flex flex-col gap-6">
        <p className="text-3xl font-extrabold leading-tight">
          {posicao === 1 ? 'Seu pedido é o próximo!' : `${posicao - 1} ${posicao === 2 ? 'pedido' : 'pedidos'} na sua frente`}
        </p>
        <Fila posicao={posicao} />
        <p className="text-[var(--text-secondary)]">Já está na cozinha. Esta tela avisa quando ficar pronto.</p>
      </div>

      {tempo !== null && tempo !== undefined && (
        <div className="flex items-center justify-center gap-2 text-[var(--text-secondary)]">
          <ClockIcon className="w-5 h-5 shrink-0" />
          <span>
            Os pedidos estão levando <strong className="text-[var(--text-primary)]">cerca de {Math.max(tempo, 1)} min</strong>.
            É uma estimativa.
          </span>
        </div>
      )}
    </div>
  );
}

function Pronto({ numero }) {
  return (
    <div
      role="alert"
      className="flex-1 mt-6 rounded-3xl flex flex-col items-center justify-center gap-4 text-center text-white px-6 py-12"
      style={{ backgroundColor: VERDE }}
    >
      <span className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20">
        <CheckIcon className="w-14 h-14" />
      </span>
      <p className="text-4xl font-extrabold leading-tight">Seu pedido está pronto!</p>
      <p className="text-xl font-semibold opacity-90">Pedido {numero}</p>
    </div>
  );
}

function Mensagem({ titulo, texto, cor = 'var(--text-primary)', children }) {
  return (
    <div className="flex flex-col items-center gap-3 mt-10 text-center">
      <p className="text-2xl font-extrabold" style={{ color: cor }}>
        {titulo}
      </p>
      {texto && <p className="text-[var(--text-secondary)]">{texto}</p>}
      {children}
    </div>
  );
}

function BotaoOutroNumero({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="mt-8 self-center text-sm font-semibold underline text-[var(--text-secondary)]">
      Acompanhar outro pedido
    </button>
  );
}

export default function Acompanhar() {
  const { codigo } = useParams();
  const [pagina, setPagina] = useState(undefined); // undefined = carregando, null = não existe
  const [erroPagina, setErroPagina] = useState('');
  const [numero, setNumero] = useState(() => lerNumeroSalvo(codigo));
  const [situacao, setSituacao] = useState(null);
  const [aviso, setAviso] = useState(''); // sem internet ou limite de consultas
  const [erroNumero, setErroNumero] = useState('');
  const statusAntes = useRef(null);

  useEffect(() => {
    let ativo = true;
    buscarPaginaPublica(codigo)
      .then((p) => ativo && setPagina(p))
      .catch((e) => ativo && setErroPagina(e.message));
    return () => {
      ativo = false;
    };
  }, [codigo]);

  useEffect(() => {
    if (pagina) document.title = pagina.nome;
  }, [pagina]);

  const consultar = useCallback(async () => {
    if (!numero) return;
    try {
      const resposta = await acompanharPedido(codigo, numero);
      setAviso('');
      if (!resposta.encontrado) {
        setErroNumero(`Não achamos o pedido ${numero} hoje. Confira o número com o atendente.`);
        setNumero(null);
        salvarNumero(codigo, null);
        setSituacao(null);
        return;
      }
      setSituacao(resposta);
    } catch (e) {
      setAviso(e instanceof ErroPaginaPublica ? e.message : 'Sem conexão. Tentando de novo...');
    }
  }, [codigo, numero]);

  const encerrado = situacao && ['entregue', 'cancelado'].includes(situacao.status);

  useEffect(() => {
    if (!pagina || !numero || encerrado) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- primeira consulta vinda do banco
    consultar();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') consultar();
    }, INTERVALO_SEGUNDOS * 1000);
    const aoVoltar = () => document.visibilityState === 'visible' && consultar();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [pagina, numero, encerrado, consultar]);

  useEffect(() => {
    const status = situacao?.status ?? null;
    if (status === 'pronto' && statusAntes.current && statusAntes.current !== 'pronto') avisarPronto();
    if (pagina) document.title = status === 'pronto' ? `Pronto! Pedido ${numero}` : pagina.nome;
    statusAntes.current = status;
  }, [situacao, pagina, numero]);

  function comecar(novo) {
    setErroNumero('');
    setSituacao(null);
    statusAntes.current = null;
    salvarNumero(codigo, novo);
    setNumero(novo);
  }

  if (erroPagina) {
    return (
      <Moldura nome="">
        <Mensagem titulo="Não foi possível abrir" texto={erroPagina} />
      </Moldura>
    );
  }
  if (pagina === undefined) {
    return (
      <Moldura nome="">
        <Carregando texto="Abrindo..." />
      </Moldura>
    );
  }
  if (pagina === null) {
    return (
      <Moldura nome="">
        <Mensagem titulo="Página não encontrada" texto="Peça ajuda ao atendente." />
      </Moldura>
    );
  }

  let conteudo;
  if (!numero) {
    conteudo = <FormularioNumero erro={erroNumero} onEnviar={comecar} />;
  } else if (!situacao) {
    conteudo = <Carregando texto={`Procurando o pedido ${numero}...`} />;
  } else if (situacao.status === 'pronto') {
    conteudo = <Pronto numero={numero} />;
  } else if (situacao.status === 'entregue') {
    conteudo = <Mensagem titulo="Pedido entregue" texto="Bom apetite!" cor={VERDE} />;
  } else if (situacao.status === 'cancelado') {
    conteudo = (
      <Mensagem titulo="Pedido cancelado" texto={`O pedido ${numero} foi cancelado. Fale com o atendente.`} cor="var(--color-accent-cozinha)" />
    );
  } else {
    conteudo = <NaFila numero={numero} situacao={situacao} />;
  }

  return (
    <Moldura nome={pagina.nome}>
      {aviso && (
        <p role="status" className="mt-2 rounded-xl px-4 py-2 text-center text-sm font-semibold bg-[var(--surface-card)] text-[var(--text-secondary)]">
          {aviso}
        </p>
      )}
      {conteudo}
      {numero && <BotaoOutroNumero onClick={() => comecar(null)} />}
    </Moldura>
  );
}
