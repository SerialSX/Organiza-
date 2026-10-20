import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import TelaDeAcesso from '../components/TelaDeAcesso';
import Campo, { classeCampo } from '../components/ui/Campo';
import CampoSenha from '../components/ui/CampoSenha';
import Botao from '../components/ui/Botao';
import Aviso from '../components/ui/Aviso';
import { CheckIcon } from '../components/icons/AppIcons';
import { TAMANHO_CODIGO, limparCodigo, validarRedefinicao } from '../lib/recuperacaoSenha';

const linkTexto = 'font-semibold text-[var(--texto-laranja)] underline-offset-4 hover:underline';

export default function RedefinirSenha() {
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

  if (pronto) {
    return (
      <TelaDeAcesso titulo="Senha redefinida">
        <div className="flex flex-col items-center gap-3 text-center" role="status">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[color-mix(in_srgb,var(--color-accent-relatorios)_18%,transparent)] text-[var(--texto-relatorios)]">
            <CheckIcon className="w-7 h-7" />
          </span>
          <p className="text-[var(--text-primary)]">Pronto. Você já está dentro da sua conta com a senha nova.</p>
        </div>
        <Botao tamanho="grande" larguraTotal onClick={() => navigate('/home', { replace: true })}>
          Ir para o painel
        </Botao>
      </TelaDeAcesso>
    );
  }

  return (
    <TelaDeAcesso
      titulo="Criar nova senha"
      subtitulo={
        codigoAceito
          ? 'Código confirmado. Agora escolha a nova senha.'
          : 'Digite o código de 6 dígitos que enviamos para o seu e-mail e escolha a nova senha.'
      }
      rodape={
        <Link to="/login" className={linkTexto}>
          Voltar para o login
        </Link>
      }
    >
      {erro && <Aviso>{erro}</Aviso>}

      <form onSubmit={handleSalvar} noValidate className="flex flex-col gap-4">
        {!codigoAceito && (
          <>
            <Campo
              rotulo="E-mail"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={alterar(setEmail)}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="codigo" className="text-sm font-medium text-[var(--text-secondary)]">
                Código de 6 dígitos
              </label>
              <input
                id="codigo"
                name="codigo"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                spellCheck={false}
                translate="no"
                maxLength={TAMANHO_CODIGO}
                placeholder="000000"
                value={codigo}
                onChange={(e) => {
                  setCodigo(limparCodigo(e.target.value));
                  setErro('');
                }}
                className={`${classeCampo} text-center text-2xl font-bold tracking-[0.4em] tabular-nums`}
              />
              <Link
                to="/esqueci-senha"
                state={{ email: email.trim() }}
                className={`self-end text-sm ${linkTexto}`}
              >
                O código venceu? Pedir outro
              </Link>
            </div>
          </>
        )}

        <CampoSenha rotulo="Nova senha" name="senha" autoComplete="new-password" value={senha} onChange={alterar(setSenha)} />
        <CampoSenha
          rotulo="Confirmar nova senha"
          name="confirmar"
          autoComplete="new-password"
          value={confirmarSenha}
          onChange={alterar(setConfirmarSenha)}
        />

        <Botao type="submit" tamanho="grande" larguraTotal disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar nova senha'}
        </Botao>
      </form>
    </TelaDeAcesso>
  );
}
