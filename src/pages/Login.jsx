import { useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import { useAuth } from '../context/useAuth';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import './Login.css';

export default function Login() {
  const { theme, mode } = useTheme();
  const { entrar, autenticado, carregando, modoDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const destino = location.state?.from ?? '/home';

  if (!modoDemo && !carregando && autenticado) return <Navigate to={destino} replace />;

  async function handleLogin(e) {
    e.preventDefault();
    setErro('');
    if (!modoDemo && (!email.trim() || !senha)) {
      setErro('Preencha e-mail e senha.');
      return;
    }
    setEnviando(true);
    const { erro: falha } = await entrar(email.trim(), senha);
    if (falha) {
      setEnviando(false);
      setErro(falha);
      return;
    }
    // Com Supabase, o <Navigate> acima redireciona quando a sessão e o perfil
    // chegarem; navegar antes disso esbarraria no ProtectedRoute.
    if (modoDemo) navigate(destino, { replace: true });
  }

  const inputStyle = {
    backgroundColor: theme.backgroundElement,
    color: theme.text,
    borderColor: theme.inputBorder,
  };

  return (
    <div
      className="login-container"
      style={{
        background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})`,
      }}
    >
      <form className="login-form" onSubmit={handleLogin} noValidate>
        <img
          src={mode === 'dark' ? logoDark : logoLight}
          alt="Organiza+"
          className="login-logo"
          onClick={() => navigate('/')}
        />

        {location.state?.justCreated && (
          <p className="login-success-banner">
            Conta criada com sucesso! Faça login para continuar.
          </p>
        )}

        <h1 style={{ color: theme.text, textAlign: 'center', marginBottom: 32, fontSize: 22 }}>Acesse sua conta</h1>

        {modoDemo && (
          <p className="login-info">Modo demonstração: é só tocar em Entrar.</p>
        )}

        {erro && <p className="login-error" role="alert">{erro}</p>}

        <input
          type="email"
          placeholder="E-mail"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />

        <input
          type="password"
          placeholder="Senha"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          style={inputStyle}
        />

        <button type="submit" disabled={enviando} style={{ backgroundColor: theme.accent }}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>

        <p
          className="login-link"
          style={{ color: theme.link }}
          onClick={() => navigate('/cadastro')}
        >
          Criar conta
        </p>
      </form>
    </div>
  );
}
