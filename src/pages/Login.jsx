import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Login.css';

export default function Login() {
  const { theme } = useTheme();
  const navigate = useNavigate();
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
        <h1 style={{ color: theme.text }}>Organiza+</h1>
        <p style={{ color: theme.textSecondary }}>Acesse sua conta</p>

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