import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import TelaDeAcesso from '../components/TelaDeAcesso';
import Campo from '../components/ui/Campo';
import Botao from '../components/ui/Botao';
import Aviso from '../components/ui/Aviso';
import { SendIcon } from '../components/icons/AppIcons';
import { validarEmail } from '../lib/recuperacaoSenha';

const linkTexto = 'font-semibold text-[var(--texto-laranja)] underline-offset-4 hover:underline';

export default function EsqueciSenha() {
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
      e.currentTarget.elements.namedItem('email')?.focus();
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

  const rodape = (
    <Link to="/login" className={linkTexto}>
      Voltar para o login
    </Link>
  );

  if (enviado) {
    // Mesmo texto para qualquer e-mail, para não revelar quem tem conta.
    return (
      <TelaDeAcesso titulo="Confira seu e-mail" rodape={rodape}>
        <div className="flex flex-col items-center gap-3 text-center" role="status">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[color-mix(in_srgb,var(--color-brand-orange)_18%,transparent)] text-[var(--texto-laranja)]">
            <SendIcon className="w-7 h-7" />
          </span>
          <p className="text-[var(--text-primary)]">
            Se existir uma conta com <strong className="break-all">{email.trim()}</strong>, você vai receber um código de
            6 dígitos para criar uma nova senha. Ele vale por 15 minutos.
          </p>
          {modoDemo && <Aviso tipo="info">Modo demonstração: nenhum e-mail é enviado.</Aviso>}
        </div>
        <Botao
          tamanho="grande"
          larguraTotal
          onClick={() => navigate('/redefinir-senha', { state: { email: email.trim() } })}
        >
          Já tenho o código
        </Botao>
      </TelaDeAcesso>
    );
  }

  return (
    <TelaDeAcesso
      titulo="Esqueceu a senha?"
      subtitulo="Digite o e-mail da sua conta para receber um código de 6 dígitos."
      rodape={rodape}
    >
      <form onSubmit={handleEnviar} noValidate className="flex flex-col gap-4">
        <Campo
          rotulo="E-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="voce@exemplo.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErro('');
          }}
          erro={erro}
        />
        <Botao type="submit" tamanho="grande" larguraTotal disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar código'}
        </Botao>
      </form>
    </TelaDeAcesso>
  );
}
