import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Botao from '../components/ui/Botao';
import Campo from '../components/ui/Campo';
import CampoSenha from '../components/ui/CampoSenha';
import { TrashIcon } from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';

const CONFIRMACAO = 'EXCLUIR';

export default function ExcluirConta() {
  const navigate = useNavigate();
  const { excluirConta, perfil, modoDemo } = useAuth();
  const [texto, setTexto] = useState('');
  const [senha, setSenha] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState('');
  const dono = perfil.papel === 'admin';
  // Maiúscula ou minúscula tanto faz: o que importa é a pessoa ter digitado.
  const confirmado = texto.trim().toUpperCase() === CONFIRMACAO && (modoDemo || senha.length > 0);

  async function handleExcluir(e) {
    e.preventDefault();
    if (!confirmado || excluindo) return;
    setErro('');
    setExcluindo(true);
    // Todos os aparelhos do negócio usam a mesma conta: a senha (conferida no
    // banco) confirma que é o dono, e não alguém com o celular do balcão na mão.
    const { erro: falha } = await excluirConta(senha);
    if (falha) {
      setErro(falha);
      setExcluindo(false);
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <AppShell largura="max-w-2xl">
      <PageHeader icon={TrashIcon} accent="var(--color-accent-cozinha)" title="Excluir conta" subtitle="Não dá para desfazer." />

      <form
        onSubmit={handleExcluir}
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 flex flex-col gap-4"
      >
        <p className="text-[var(--text-primary)]">
          {dono
            ? 'Seu negócio, produtos, pedidos e as contas da sua equipe serão apagados para sempre.'
            : 'Sua conta será apagada. Os dados do negócio continuam com o dono.'}
        </p>
        <Campo
          rotulo={`Para confirmar, digite ${CONFIRMACAO}`}
          name="confirmacao"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {!modoDemo && (
          <CampoSenha
            rotulo="Sua senha"
            name="senha"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        )}
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex flex-wrap gap-3">
          <Botao type="submit" variante="perigo" disabled={!confirmado || excluindo}>
            {excluindo ? 'Excluindo…' : 'Excluir minha conta'}
          </Botao>
          <Botao para="/minha-conta" variante="secundaria">
            Cancelar
          </Botao>
        </div>
      </form>
    </AppShell>
  );
}
