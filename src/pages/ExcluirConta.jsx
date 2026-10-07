import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import { TrashIcon } from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';

export default function ExcluirConta() {
  const navigate = useNavigate();
  const { excluirConta } = useAuth();
  const [texto, setTexto] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState('');

  async function handleExcluir(e) {
    e.preventDefault();
    if (texto !== 'EXCLUIR' || excluindo) return;
    setErro('');
    setExcluindo(true);
    const { erro: falha } = await excluirConta();
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

      <form onSubmit={handleExcluir} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 flex flex-col gap-4">
        <p className="text-[var(--text-primary)]">Seu negócio, produtos e pedidos serão apagados para sempre.</p>
        <input
          placeholder="Digite EXCLUIR para confirmar"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3 text-[var(--text-primary)]"
        />
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={texto !== 'EXCLUIR' || excluindo}
            className="rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-50 bg-[var(--color-accent-cozinha)]"
          >
            {excluindo ? 'Excluindo...' : 'Excluir minha conta'}
          </button>
          <button type="button" onClick={() => navigate('/minha-conta')} className="rounded-xl px-5 py-3 font-semibold border border-[var(--border-subtle)] text-[var(--text-primary)]">
            Cancelar
          </button>
        </div>
      </form>
    </AppShell>
  );
}
