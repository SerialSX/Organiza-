import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import { useAuth } from '../context/useAuth';
import { CheckIcon } from '../components/icons/AppIcons';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import './Login.css';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validar({ nome, negocio, email, senha, confirmarSenha }) {
  if (!nome.trim() || !negocio.trim() || !email.trim() || !senha) return 'Preencha todos os campos.';
  if (!EMAIL_VALIDO.test(email.trim())) return 'Digite um e-mail válido.';
  if (senha.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (senha !== confirmarSenha) return 'As senhas não coincidem.';
  return null;
}

export default function Cadastro() {
  const { theme, mode } = useTheme();
  const { cadastrar, modoDemo, autenticado } = useAuth();
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [negocio, setNegocio] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  // null | 'pronto' | 'confirmar-email'
  const [sucesso, setSucesso] = useState(null);

  async function handleCadastro(e) {
    e.preventDefault();
    const invalido = validar({ nome, negocio, email, senha, confirmarSenha });
    if (invalido) {
      setErro(invalido);
      return;
    }

    setErro('');
    setEnviando(true);
    const { erro: falha, precisaConfirmar } = await cadastrar({
      nome: nome.trim(),
      negocio: negocio.trim(),
      email: email.trim(),
      senha,
    });
    setEnviando(false);

    if (falha) {
      setErro(falha);
      return;
    }

    if (precisaConfirmar) {
      setSucesso('confirmar-email');
      return;
    }

    setSucesso('pronto');
    // Com Supabase, o redirecionamento acontece quando a sessão chega (abaixo).
    if (modoDemo) setTimeout(() => navigate('/login', { state: { justCreated: true } }), 1500);
  }

  // Sessão e perfil chegam juntos; sem perfil, o ProtectedRoute explica o problema.
  if (!modoDemo && sucesso === 'pronto' && autenticado) return <Navigate to="/home" replace />;

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
      <form className="login-form" onSubmit={handleCadastro} noValidate>
        <img
          src={mode === 'dark' ? logoDark : logoLight}
          alt="Organiza+"
          className="login-logo"
          onClick={() => navigate('/')}
        />

        {sucesso === 'pronto' && (
          <div className="login-success" role="status">
            <span className="login-success-icon">
              <CheckIcon width={28} height={28} />
            </span>
            <h1 style={{ color: theme.text }}>Conta criada com sucesso!</h1>
            <p style={{ color: theme.textSecondary }}>
              {modoDemo ? 'Redirecionando para o login...' : 'Entrando no seu painel...'}
            </p>
          </div>
        )}

        {sucesso === 'confirmar-email' && (
          <div className="login-success" role="status">
            <span className="login-success-icon">
              <CheckIcon width={28} height={28} />
            </span>
            <h1 style={{ color: theme.text }}>Falta só confirmar</h1>
            <p style={{ color: theme.textSecondary }}>
              Enviamos um link para {email.trim()}. Abra o e-mail, confirme e depois faça login.
            </p>
            <button type="button" onClick={() => navigate('/login')} style={{ backgroundColor: theme.accent, width: '100%' }}>
              Ir para o login
            </button>
          </div>
        )}

        {!sucesso && (
          <>
            <h1 style={{ color: theme.text }}>Criar conta</h1>
            <p style={{ color: theme.textSecondary }}>Cadastre seu negócio no Organiza+</p>

            {erro && <p className="login-error" role="alert">{erro}</p>}

            <input
              type="text"
              placeholder="Nome completo"
              autoComplete="name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={inputStyle}
            />

            <input
              type="text"
              placeholder="Nome do negócio"
              autoComplete="organization"
              value={negocio}
              onChange={(e) => setNegocio(e.target.value)}
              style={inputStyle}
            />

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
              placeholder="Senha (mínimo 6 caracteres)"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              style={inputStyle}
            />

            <input
              type="password"
              placeholder="Confirmar senha"
              autoComplete="new-password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              style={inputStyle}
            />

            <button type="submit" disabled={enviando} style={{ backgroundColor: theme.accent }}>
              {enviando ? 'Criando conta...' : 'Cadastrar'}
            </button>

            <p
              className="login-link"
              style={{ color: theme.link }}
              onClick={() => navigate('/login')}
            >
              Já tenho conta
            </p>
          </>
        )}
      </form>
    </div>
  );
}
