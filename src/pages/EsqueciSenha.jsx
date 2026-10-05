import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import './Login.css';

export default function EsqueciSenha() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);

  function handleEnviar(e) {
    e.preventDefault();
    // TODO: enviar o e-mail pelo Supabase
    setEnviado(true);
  }

  return (
    <div className="login-container" style={{ background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})` }}>
      <form className="login-form" onSubmit={handleEnviar} noValidate>
        <h1 style={{ color: theme.text }}>Esqueci a senha</h1>

        {enviado ? (
          <p style={{ color: theme.textSecondary }}>
            Se existir uma conta com {email}, enviamos um link para criar uma senha nova.
          </p>
        ) : (
          <>
            <p style={{ color: theme.textSecondary }}>Digite seu e-mail para receber o link.</p>
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.inputBorder }}
            />
            <button type="submit" style={{ backgroundColor: theme.accent }}>Enviar link</button>
          </>
        )}

        <p className="login-link" style={{ color: theme.link }} onClick={() => navigate('/login')}>
          Voltar para o login
        </p>
      </form>
    </div>
  );
}
