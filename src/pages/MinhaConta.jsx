import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Botao from '../components/ui/Botao';
import Campo, { classeCampo } from '../components/ui/Campo';
import CampoSenha from '../components/ui/CampoSenha';
import { UserIcon, QrIcon, TrashIcon } from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';
import EscolhaDoModo from '../components/boasVindas/EscolhaDoModo';
import EscolhaDaCozinha from '../components/boasVindas/EscolhaDaCozinha';
import { atendeNoBalcao, modoDoNegocio } from '../lib/atendimento';
import { viradaMudaODia } from '../lib/formatadores';

const ACCENT = 'var(--color-brand-orange)';
const PERIGO = 'var(--color-accent-cozinha)';

const PAPEIS = { admin: 'Dono do negócio', atendente: 'Atendente', cozinha: 'Cozinha' };

const caixa = 'rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 sm:p-8 flex flex-col gap-4';

function suave(cor) {
  return `color-mix(in srgb, ${cor} 15%, transparent)`;
}

// "lucas silva" -> "LS"
function iniciais(nome) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

function Secao({ titulo, texto, children }) {
  return (
    <section className={caixa}>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">{titulo}</h2>
        {texto && <p className="text-sm text-[var(--text-secondary)]">{texto}</p>}
      </div>
      {children}
    </section>
  );
}

function Perfil({ perfil, papel }) {
  return (
    <section className={`${caixa} sm:flex-row items-center gap-6 text-center sm:text-left`}>
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-bold text-[var(--sobre-destaque)] shrink-0 shadow-lg"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${PERIGO})` }}
      >
        {iniciais(perfil.nome)}
      </span>
      <div className="min-w-0">
        <p className="text-3xl font-bold text-[var(--text-primary)] capitalize break-words">{perfil.nome}</p>
        <p className="mt-1 text-lg text-[var(--text-secondary)] break-words">{perfil.negocio_nome}</p>
        <span
          className="mt-3 inline-block rounded-full px-4 py-1.5 text-sm font-semibold text-[var(--texto-laranja)]"
          style={{ backgroundColor: suave(ACCENT) }}
        >
          {papel}
        </span>
      </div>
    </section>
  );
}

function SeusDados({ perfil }) {
  const { atualizarDados } = useAuth();
  const dono = perfil.papel === 'admin';
  const [nome, setNome] = useState(perfil.nome ?? '');
  const [nomeNegocio, setNomeNegocio] = useState(perfil.negocio_nome ?? '');
  const [mensagem, setMensagem] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const mudou = nome.trim() !== perfil.nome || (dono && nomeNegocio.trim() !== perfil.negocio_nome);

  async function salvar(e) {
    e.preventDefault();
    setMensagem(null);
    if (!nome.trim() || (dono && !nomeNegocio.trim())) {
      setMensagem({ tipo: 'erro', texto: 'Os nomes não podem ficar em branco.' });
      return;
    }
    setSalvando(true);
    const { erro } = await atualizarDados({ nome: nome.trim(), nomeNegocio: dono ? nomeNegocio.trim() : null });
    setSalvando(false);
    setMensagem(erro ? { tipo: 'erro', texto: erro } : { tipo: 'sucesso', texto: 'Dados salvos.' });
  }

  return (
    <Secao titulo="Dados da conta">
      {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <Campo rotulo="Seu nome" name="nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
        {dono && (
          <Campo
            rotulo="Nome do negócio"
            name="negocio"
            autoComplete="organization"
            value={nomeNegocio}
            onChange={(e) => setNomeNegocio(e.target.value)}
            maxLength={120}
            dica="Aparece no painel. O nome que o cliente vê no QR code fica na Página do cliente."
          />
        )}
        {perfil.email && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--text-secondary)]">E-mail</span>
            <p className="text-[var(--text-primary)] break-all">{perfil.email}</p>
          </div>
        )}
        <Botao type="submit" cor={ACCENT} className="self-start" disabled={!mudou || salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </form>
    </Secao>
  );
}

const HORAS_DE_VIRADA = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function rotuloDaHora(h) {
  return h === 0 ? 'Meia-noite' : `${h}h da manhã`;
}

// Só o dono: como atende, se a cozinha tem aparelho próprio e até que horas
// o dia de trabalho vai. As duas primeiras são as perguntas de boas-vindas.
function ComoVoceAtende({ perfil }) {
  const { configurarOperacao, configurarAtendimento } = useAuth();
  const modoSalvo = modoDoNegocio(perfil);
  const telaSalva = perfil.usa_tela_cozinha !== false;
  const [modo, setModo] = useState(modoSalvo);
  const [virada, setVirada] = useState(perfil.virada_do_dia ?? 5);
  const [usaTela, setUsaTela] = useState(telaSalva);
  const [mensagem, setMensagem] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const mudouAtendimento = modo !== modoSalvo || usaTela !== telaSalva;
  const viradaAtual = perfil.virada_do_dia ?? 5;
  const mudouVirada = virada !== viradaAtual;
  // Entre 0h e 8h, trocar a virada pode virar o dia no meio do turno: o banco
  // recusa, então a tela avisa antes.
  const viradaNoTurno = viradaMudaODia(virada, viradaAtual);

  async function salvar(e) {
    e.preventDefault();
    setMensagem(null);
    setSalvando(true);
    const trocouVirada = mudouVirada;
    let { erro } = mudouAtendimento ? await configurarAtendimento({ modo, usaTelaCozinha: usaTela }) : { erro: null };
    if (!erro && mudouVirada) ({ erro } = await configurarOperacao({ viradaDoDia: virada, usaTelaCozinha: usaTela }));
    setSalvando(false);
    if (erro) setMensagem({ tipo: 'erro', texto: erro });
    else if (trocouVirada) {
      setMensagem({
        tipo: 'sucesso',
        texto:
          'Salvo. Nos outros aparelhos (cozinha, celulares da equipe), feche e abra o sistema de novo para eles contarem o dia com a nova hora.',
      });
    } else setMensagem({ tipo: 'sucesso', texto: 'Salvo.' });
  }

  return (
    <Secao titulo="Como você atende" texto="Vale para todos os aparelhos do negócio.">
      {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}
      <form onSubmit={salvar} className="flex flex-col gap-6">
        <EscolhaDoModo valor={modo} onMudar={setModo} legendaVisivel colunas="" />
        <p className="-mt-3 text-sm">
          <Link to="/ajuda#como-funciona" className="font-semibold text-[var(--texto-laranja)] underline-offset-4 hover:underline">
            Ver o passo a passo de cada jeito
          </Link>
        </p>
        <EscolhaDaCozinha valor={usaTela} onMudar={setUsaTela} legendaVisivel colunas="" />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="virada" className="text-sm font-medium text-[var(--text-secondary)]">
            O dia de trabalho termina às
          </label>
          <select id="virada" value={virada} onChange={(e) => setVirada(Number(e.target.value))} className={classeCampo}>
            {HORAS_DE_VIRADA.map((h) => (
              <option key={h} value={h}>
                {rotuloDaHora(h)}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--text-secondary)]">
            Pedidos até essa hora contam no dia anterior: a fila não some e a senha não recomeça no meio do turno.
          </p>
          {viradaNoTurno && (
            <p className="text-sm font-semibold text-[var(--texto-cozinha)]">
              Agora não dá para mudar para essa hora: o dia de trabalho viraria no meio do turno. Mude depois das 8h da manhã.
            </p>
          )}
        </div>

        <Botao
          type="submit"
          cor={ACCENT}
          className="self-start"
          disabled={!(mudouAtendimento || mudouVirada) || salvando || viradaNoTurno}
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </form>
    </Secao>
  );
}

function TrocarSenha() {
  const { trocarSenha, confirmarSenhaAtual, modoDemo } = useAuth();
  const [mensagem, setMensagem] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const dados = new FormData(formulario);
    const atual = String(dados.get('senhaAtual') ?? '');
    const senha = String(dados.get('senha') ?? '');
    setMensagem(null);
    if (senha.length < 6) {
      setMensagem({ tipo: 'erro', texto: 'A senha precisa ter pelo menos 6 caracteres.' });
      return;
    }
    setSalvando(true);
    // Todos os aparelhos usam a mesma conta: sem a senha atual, quem estivesse
    // com o celular do balcão na mão poderia tomar a conta do dono.
    const conferida = await confirmarSenhaAtual(atual);
    if (conferida.erro) {
      setSalvando(false);
      setMensagem({ tipo: 'erro', texto: conferida.erro });
      return;
    }
    const { erro } = await trocarSenha(senha, atual);
    setSalvando(false);
    if (erro) setMensagem({ tipo: 'erro', texto: erro });
    else {
      formulario.reset();
      setMensagem({ tipo: 'sucesso', texto: 'Senha trocada.' });
    }
  }

  return (
    <Secao titulo="Senha">
      {modoDemo && <Aviso tipo="info">No modo demonstração não há senha.</Aviso>}
      {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <CampoSenha rotulo="Senha atual" name="senhaAtual" autoComplete="current-password" />
        <CampoSenha rotulo="Senha nova" name="senha" autoComplete="new-password" dica="Mínimo de 6 caracteres." />
        <Botao type="submit" cor={ACCENT} className="self-start" disabled={salvando || modoDemo}>
          {salvando ? 'Salvando…' : 'Trocar senha'}
        </Botao>
      </form>
    </Secao>
  );
}

function SairDeTodos() {
  const { sairDeTodosOsAparelhos } = useAuth();
  const navigate = useNavigate();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState('');

  async function sair() {
    const { erro: falha } = await sairDeTodosOsAparelhos();
    if (falha) {
      setErro(falha);
      return;
    }
    navigate('/login', { replace: true });
  }

  return (
    <Secao
      titulo="Aparelhos conectados"
      texto="Perdeu um celular ou alguém que saiu da equipe sabe a senha? Saia de todos os aparelhos e depois troque a senha."
    >
      {erro && <Aviso>{erro}</Aviso>}
      {confirmando ? (
        <div className="flex flex-wrap gap-2">
          <Botao variante="perigo" onClick={sair}>
            Sair de todos agora
          </Botao>
          <Botao variante="secundaria" onClick={() => setConfirmando(false)}>
            Voltar
          </Botao>
        </div>
      ) : (
        <Botao variante="secundaria" className="self-start" onClick={() => setConfirmando(true)}>
          Sair de todos os aparelhos
        </Botao>
      )}
    </Secao>
  );
}

export default function MinhaConta() {
  const { perfil } = useAuth();
  const papel = PAPEIS[perfil.papel] ?? perfil.papel;

  return (
    <AppShell largura="max-w-3xl">
      <PageHeader icon={UserIcon} accent={ACCENT} title="Minha conta" subtitle="Seus dados e as configurações da sua conta" />

      <div className="flex flex-col gap-6">
        <Perfil perfil={perfil} papel={papel} />
        <SeusDados perfil={perfil} />
        {perfil.papel === 'admin' && <ComoVoceAtende perfil={perfil} />}
        <TrocarSenha />

        {/* Atalho para a página do QR code (só o dono configura) */}
        {perfil.papel === 'admin' && atendeNoBalcao(modoDoNegocio(perfil)) && (
          <Link to="/pagina-do-cliente" className={`${caixa} sm:flex-row sm:items-center gap-4 hover:bg-[var(--surface-card-hover)] transition-colors`}>
            <span
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl shrink-0 text-[var(--texto-laranja)]"
              style={{ backgroundColor: suave(ACCENT) }}
            >
              <QrIcon className="w-6 h-6" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-lg font-semibold text-[var(--text-primary)]">Página do cliente</span>
              <span className="block text-sm text-[var(--text-secondary)]">QR code para seus clientes acompanharem o pedido</span>
            </span>
          </Link>
        )}

        <SairDeTodos />

        {/* Zona de perigo */}
        <section className={caixa} style={{ borderColor: `color-mix(in srgb, ${PERIGO} 55%, transparent)` }}>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl shrink-0 text-[var(--texto-cozinha)]"
              style={{ backgroundColor: suave(PERIGO) }}
            >
              <TrashIcon className="w-6 h-6" />
            </span>
            <h2 className="text-xl font-bold text-[var(--texto-cozinha)]">Zona de perigo</h2>
          </div>
          <p className="text-base text-[var(--text-secondary)]">
            Excluir a conta apaga para sempre o seu negócio, os produtos, os pedidos e os relatórios. Não dá para desfazer.
          </p>
          <Botao para="/minha-conta/excluir" variante="secundaria" className="self-start border-2 border-[var(--color-accent-cozinha)] text-[var(--texto-cozinha)]">
            <TrashIcon className="w-5 h-5" />
            Excluir conta
          </Botao>
        </section>

        <p className="text-sm text-center">
          <Link to="/privacidade" className="font-semibold text-[var(--texto-laranja)] underline-offset-4 hover:underline">
            Como cuidamos dos seus dados
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
