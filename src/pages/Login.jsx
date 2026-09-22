import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import './Login.css';

export default function Login() {
  const { theme, mode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  function handleLogin(e) {
    e.preventDefault();
    console.log('Login:', email, senha);
    navigate('/home');
  }

  return (
    <div
      className="login-container"
      style={{
        background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})`,
      }}
    >
      <form className="login-form" onSubmit={handleLogin}>
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

        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            backgroundColor: theme.backgroundElement,
            color: theme.text,
            borderColor: theme.inputBorder,
          }}
        />

        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          style={{
            backgroundColor: theme.backgroundElement,
            color: theme.text,
            borderColor: theme.inputBorder,
          }}
        />

        <button type="submit" style={{ backgroundColor: theme.accent }}>
          Entrar
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