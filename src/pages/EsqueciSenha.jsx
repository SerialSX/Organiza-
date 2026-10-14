import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import { useAuth } from '../context/useAuth';
import { SendIcon } from '../components/icons/AppIcons';
import { validarEmail } from '../lib/recuperacaoSenha';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import './Login.css';

export default function EsqueciSenha() {
  const { theme, mode } = useTheme();
  const { pedirCodigoSenha, modoDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Vindo de "Pedir outro" na tela do código, o e-mail já chega preenchido.
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleEnviar(e) {
    e.preventDefault();
    if (enviando) return;
    const invalido = validarEmail(email);
    if (invalido) {
      setErro(invalido);
      return;
    }
    setErro('');
    setEnviando(true);
    const { erro: falha } = await pedirCodigoSenha(email.trim());
    setEnviando(false);
    if (falha) {
      setErro(falha);
      return;
    }
    setEnviado(true);
  }

  const inputStyle = {
    backgroundColor: theme.backgroundElement,
    color: theme.text,
    borderColor: theme.inputBorder,
  };

  return (
    <div className="login-container" style={{ background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})` }}>
      <form className="login-form" onSubmit={handleEnviar} noValidate>
        <img
          src={mode === 'dark' ? logoDark : logoLight}
          alt="Organiza+"
          className="login-logo"
          onClick={() => navigate('/')}
        />

        {enviado ? (
          // Mesmo texto para qualquer e-mail, para não revelar quem tem conta.
          <div className="login-success" role="status">
            <span className="login-success-icon">
              <SendIcon width={26} height={26} />
            </span>
            <h1 style={{ color: theme.text }}>Confira seu e-mail</h1>
            <p style={{ color: theme.textSecondary }}>
              Se existir uma conta com {email.trim()}, você vai receber um código de 6 dígitos para criar uma nova
              senha. Ele vale por 15 minutos.
            </p>
            {modoDemo && <p className="login-info">Modo demonstração: nenhum e-mail é enviado.</p>}
            <button
              type="button"
              onClick={() => navigate('/redefinir-senha', { state: { email: email.trim() } })}
              style={{ backgroundColor: theme.accent, width: '100%' }}
            >
              Já tenho o código
            </button>
          </div>
        ) : (
          <>
            <h1 style={{ color: theme.text }}>Esqueceu a senha?</h1>
            <p style={{ color: theme.textSecondary }}>Digite o e-mail da sua conta para receber um código de 6 dígitos.</p>

            {erro && <p className="login-error" role="alert">{erro}</p>}

            <input
              type="email"
              placeholder="E-mail"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErro('');
              }}
              style={inputStyle}
            />
            <button type="submit" disabled={enviando} style={{ backgroundColor: theme.accent }}>
              {enviando ? 'Enviando...' : 'Enviar código'}
            </button>
          </>
        )}

        <p className="login-link" style={{ color: theme.link }} onClick={() => navigate('/login')}>
          Voltar para o login
        </p>
      </form>
    </div>
  );
}
