import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import TelaDeAcesso from '../components/TelaDeAcesso';
import Campo from '../components/ui/Campo';
import CampoSenha from '../components/ui/CampoSenha';
import Botao from '../components/ui/Botao';
import Aviso from '../components/ui/Aviso';
import { CheckIcon } from '../components/icons/AppIcons';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const linkTexto = 'font-semibold text-[var(--texto-laranja)] underline-offset-4 hover:underline';

function validar({ nome, negocio, email, senha }) {
  const erros = {};
  if (!nome) erros.nome = 'Digite seu nome.';
  if (!negocio) erros.negocio = 'Digite o nome do seu negócio.';
  if (!email) erros.email = 'Digite seu e-mail.';
  else if (!EMAIL_VALIDO.test(email)) erros.email = 'Confira o e-mail. Ele precisa ter @ e ponto, como voce@exemplo.com.';
  if (senha.length < 6) erros.senha = 'A senha precisa ter pelo menos 6 caracteres.';
  return erros;
}

function Sucesso({ titulo, children }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center py-2" role="status">
      <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[color-mix(in_srgb,var(--color-accent-relatorios)_18%,transparent)] text-[var(--texto-relatorios)]">
        <CheckIcon className="w-7 h-7" />
      </span>
      <p className="text-xl font-bold text-[var(--text-primary)]">{titulo}</p>
      {children}
    </div>
  );
}

export default function Cadastro() {
  const { cadastrar, modoDemo, autenticado } = useAuth();
  const navigate = useNavigate();
  const formulario = useRef(null);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);
  // null | 'pronto' | 'confirmar-email'
  const [sucesso, setSucesso] = useState(null);
  const [emailEnviado, setEmailEnviado] = useState('');

  // Sessão e perfil chegam juntos; sem perfil, o ProtectedRoute explica o problema.
  if (!modoDemo && sucesso === 'pronto' && autenticado) return <Navigate to="/home" replace />;

  async function handleCadastro(e) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const valores = {
      nome: String(dados.get('nome') ?? '').trim(),
      negocio: String(dados.get('negocio') ?? '').trim(),
      email: String(dados.get('email') ?? '').trim(),
      senha: String(dados.get('senha') ?? ''),
    };
    const invalidos = validar(valores);
    setErros(invalidos);
    setErroGeral('');
    const primeiro = Object.keys(invalidos)[0];
    if (primeiro) {
      formulario.current?.elements.namedItem(primeiro)?.focus();
      return;
    }

    setEnviando(true);
    const { erro, precisaConfirmar } = await cadastrar(valores);
    setEnviando(false);
    if (erro) {
      setErroGeral(erro);
      return;
    }
    setEmailEnviado(valores.email);
    if (precisaConfirmar) {
      setSucesso('confirmar-email');
      return;
    }
    setSucesso('pronto');
    // Com Supabase, o redirecionamento acontece quando a sessão chega (acima).
    if (modoDemo) setTimeout(() => navigate('/login', { state: { justCreated: true } }), 1500);
  }

  if (sucesso === 'pronto') {
    return (
      <TelaDeAcesso titulo="Criar conta">
        <Sucesso titulo="Conta criada!">
          <p className="text-sm text-[var(--text-secondary)]">{modoDemo ? 'Indo para o login…' : 'Abrindo o seu painel…'}</p>
        </Sucesso>
      </TelaDeAcesso>
    );
  }

  if (sucesso === 'confirmar-email') {
    return (
      <TelaDeAcesso titulo="Criar conta">
        <Sucesso titulo="Falta só confirmar o e-mail">
          <p className="text-sm text-[var(--text-secondary)]">
            Enviamos um link para <strong className="text-[var(--text-primary)] break-all">{emailEnviado}</strong>. Abra o
            e-mail, toque no link e depois entre.
          </p>
          <p className="text-xs text-[var(--text-secondary)]">Não chegou? Veja a caixa de spam.</p>
        </Sucesso>
        <Botao para="/login" tamanho="grande" larguraTotal>
          Ir para o login
        </Botao>
      </TelaDeAcesso>
    );
  }

  return (
    <TelaDeAcesso
      titulo="Criar conta"
      subtitulo="Cadastre seu negócio no Organiza+"
      rodape={
        <>
          Já tem conta?{' '}
          <Link to="/login" className={linkTexto}>
            Entrar
          </Link>
        </>
      }
    >
      {erroGeral && <Aviso>{erroGeral}</Aviso>}

      <form ref={formulario} onSubmit={handleCadastro} noValidate className="flex flex-col gap-4">
        <Campo rotulo="Seu nome" name="nome" autoComplete="name" erro={erros.nome} maxLength={120} />
        <Campo
          rotulo="Nome do negócio"
          name="negocio"
          autoComplete="organization"
          placeholder="Ex.: Lanche da Ana"
          erro={erros.negocio}
          maxLength={120}
        />
        <Campo
          rotulo="E-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="voce@exemplo.com"
          erro={erros.email}
        />
        <CampoSenha name="senha" autoComplete="new-password" dica="Mínimo de 6 caracteres." erro={erros.senha} />
        <Botao type="submit" tamanho="grande" larguraTotal disabled={enviando}>
          {enviando ? 'Criando a conta…' : 'Criar conta'}
        </Botao>
        <p className="text-xs text-center text-[var(--text-secondary)]">
          Usamos seus dados só para o sistema funcionar.{' '}
          <Link to="/privacidade" className={linkTexto}>
            Veja como cuidamos deles
          </Link>
          .
        </p>
      </form>
    </TelaDeAcesso>
  );
}
