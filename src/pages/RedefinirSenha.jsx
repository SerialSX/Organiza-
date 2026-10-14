import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import { useAuth } from '../context/useAuth';
import { CheckIcon } from '../components/icons/AppIcons';
import { limparCodigo, validarRedefinicao } from '../lib/recuperacaoSenha';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import './Login.css';

export default function RedefinirSenha() {
  const { theme, mode } = useTheme();
  const { confirmarCodigoSenha, trocarSenha } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  // O código só vale uma vez: se ele passou e a senha nova foi recusada,
  // a próxima tentativa troca só a senha.
  const [codigoAceito, setCodigoAceito] = useState(false);
  const [pronto, setPronto] = useState(false);

  function alterar(setter) {
    return (e) => {
      setter(e.target.value);
      setErro('');
    };
  }

  async function handleSalvar(e) {
    e.preventDefault();
    if (enviando) return;
    const invalido = validarRedefinicao({ email, codigo, senha, confirmarSenha, codigoAceito });
    if (invalido) {
      setErro(invalido);
      return;
    }
    setErro('');
    setEnviando(true);

    if (!codigoAceito) {
      const { erro: falha } = await confirmarCodigoSenha(email.trim(), codigo);
      if (falha) {
        setErro(falha);
        setEnviando(false);
        return;
      }
      setCodigoAceito(true);
    }

    const { erro: falha } = await trocarSenha(senha);
    setEnviando(false);
    if (falha) {
      setErro(falha);
      return;
    }
    setPronto(true);
  }

  const inputStyle = {
    backgroundColor: theme.backgroundElement,
    color: theme.text,
    borderColor: theme.inputBorder,
  };

  return (
    <div className="login-container" style={{ background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})` }}>
      <form className="login-form" onSubmit={handleSalvar} noValidate>
        <img
          src={mode === 'dark' ? logoDark : logoLight}
          alt="Organiza+"
          className="login-logo"
          onClick={() => navigate('/')}
        />

        {pronto ? (
          <div className="login-success" role="status">
            <span className="login-success-icon">
              <CheckIcon width={28} height={28} />
            </span>
            <h1 style={{ color: theme.text }}>Senha redefinida</h1>
            <p style={{ color: theme.textSecondary }}>Pronto. Você já está dentro da sua conta com a senha nova.</p>
            <button
              type="button"
              onClick={() => navigate('/home', { replace: true })}
              style={{ backgroundColor: theme.accent, width: '100%' }}
            >
              Ir para o painel
            </button>
          </div>
        ) : (
          <>
            <h1 style={{ color: theme.text }}>Criar nova senha</h1>
            <p style={{ color: theme.textSecondary }}>
              {codigoAceito
                ? 'Código confirmado. Agora escolha a nova senha.'
                : 'Digite o código de 6 dígitos que enviamos para o seu e-mail e escolha a nova senha.'}
            </p>

            {erro && <p className="login-error" role="alert">{erro}</p>}

            {!codigoAceito && (
              <>
                <input
                  type="email"
                  placeholder="E-mail"
                  autoComplete="email"
                  value={email}
                  onChange={alterar(setEmail)}
                  style={inputStyle}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  aria-label="Código de 6 dígitos"
                  value={codigo}
                  onChange={(e) => {
                    setCodigo(limparCodigo(e.target.value));
                    setErro('');
                  }}
                  style={{ ...inputStyle, textAlign: 'center', fontSize: 22, letterSpacing: 8, fontWeight: 600 }}
                />
              </>
            )}

            <input
              type="password"
              placeholder="Nova senha"
              autoComplete="new-password"
              value={senha}
              onChange={alterar(setSenha)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Confirmar nova senha"
              autoComplete="new-password"
              value={confirmarSenha}
              onChange={alterar(setConfirmarSenha)}
              style={inputStyle}
            />

            <button type="submit" disabled={enviando} style={{ backgroundColor: theme.accent }}>
              {enviando ? 'Salvando...' : 'Salvar nova senha'}
            </button>

            {!codigoAceito && (
              <p
                className="login-link"
                style={{ color: theme.link }}
                onClick={() => navigate('/esqueci-senha', { state: { email: email.trim() } })}
              >
                O código venceu? Pedir outro
              </p>
            )}
          </>
        )}

        {!pronto && (
          <p className="login-link" style={{ color: theme.link, marginTop: codigoAceito ? 20 : 8 }} onClick={() => navigate('/login')}>
            Voltar para o login
          </p>
        )}
      </form>
    </div>
  );
}
