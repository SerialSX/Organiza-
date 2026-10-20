import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import TelaDeAcesso from '../components/TelaDeAcesso';
import Campo from '../components/ui/Campo';
import CampoSenha from '../components/ui/CampoSenha';
import Botao from '../components/ui/Botao';
import Aviso from '../components/ui/Aviso';

const linkTexto = 'font-semibold text-[var(--texto-laranja)] underline-offset-4 hover:underline';

export default function Login() {
  const { entrar, autenticado, carregando, modoDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campoEmail = useRef(null);

  const destino = location.state?.from ?? '/home';

  if (!modoDemo && !carregando && autenticado) return <Navigate to={destino} replace />;

  async function handleLogin(e) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const email = String(dados.get('email') ?? '').trim();
    const senha = String(dados.get('senha') ?? '');
    setErro('');
    if (!modoDemo && (!email || !senha)) {
      setErro('Preencha e-mail e senha.');
      campoEmail.current?.focus();
      return;
    }
    setEnviando(true);
    const { erro: falha } = await entrar(email, senha);
    if (falha) {
      setEnviando(false);
      setErro(falha);
      return;
    }
    // Com Supabase, o <Navigate> acima redireciona quando a sessão e o perfil
    // chegarem; navegar antes disso esbarraria no ProtectedRoute.
    if (modoDemo) navigate(destino, { replace: true });
  }

  return (
    <TelaDeAcesso
      titulo="Entrar"
      rodape={
        <>
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className={linkTexto}>
            Criar conta grátis
          </Link>
        </>
      }
    >
      {location.state?.justCreated && <Aviso tipo="sucesso">Conta criada. Agora é só entrar.</Aviso>}
      {location.state?.senhaTrocada && <Aviso tipo="sucesso">Senha trocada. Entre com a senha nova.</Aviso>}
      {modoDemo && <Aviso tipo="info">Modo demonstração: é só tocar em Entrar.</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}

      <form onSubmit={handleLogin} noValidate className="flex flex-col gap-4">
        <Campo
          ref={campoEmail}
          rotulo="E-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="voce@exemplo.com"
        />
        <CampoSenha name="senha" autoComplete="current-password" />
        <Link to="/esqueci-senha" className={`self-end text-sm ${linkTexto}`}>
          Esqueci minha senha
        </Link>
        <Botao type="submit" tamanho="grande" larguraTotal disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Botao>
      </form>
    </TelaDeAcesso>
  );
}
