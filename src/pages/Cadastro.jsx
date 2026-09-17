import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Login.css';

export default function Cadastro() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [negocio, setNegocio] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  function handleCadastro(e) {
    e.preventDefault();
    if (senha !== confirmarSenha) {
      alert('As senhas não coincidem');
      return;
    }
    // TODO: integrar com cadastro real
    console.log('Cadastro:', { nome, negocio, email, senha });
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
      <form className="login-form" onSubmit={handleCadastro}>
        <h1 style={{ color: theme.text }}>Criar conta</h1>
        <p style={{ color: theme.textSecondary }}>Cadastre seu negócio no Organiza+</p>

        <input
          type="text"
          placeholder="Nome completo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          style={inputStyle}
        />

        <input
          type="text"
          placeholder="Nome do negócio"
          value={negocio}
          onChange={(e) => setNegocio(e.target.value)}
          style={inputStyle}
        />

        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />

        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          style={inputStyle}
        />

        <input
          type="password"
          placeholder="Confirmar senha"
          value={confirmarSenha}
          onChange={(e) => setConfirmarSenha(e.target.value)}
          style={inputStyle}
        />

        <button type="submit" style={{ backgroundColor: theme.accent }}>
          Cadastrar
        </button>

        <p
          className="login-link"
          style={{ color: theme.link }}
          onClick={() => navigate('/')}
        >
          Já tenho conta
        </p>
      </form>
    </div>
  );
}