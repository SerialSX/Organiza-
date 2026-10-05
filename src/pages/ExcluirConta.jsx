import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import { TrashIcon } from '../components/icons/AppIcons';

export default function ExcluirConta() {
  const navigate = useNavigate();
  const [texto, setTexto] = useState('');

  function handleExcluir(e) {
    e.preventDefault();
    // TODO: excluir a conta no Supabase
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
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={texto !== 'EXCLUIR'}
            className="rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-50 bg-[var(--color-accent-cozinha)]"
          >
            Excluir minha conta
          </button>
          <button type="button" onClick={() => navigate('/minha-conta')} className="rounded-xl px-5 py-3 font-semibold border border-[var(--border-subtle)] text-[var(--text-primary)]">
            Cancelar
          </button>
        </div>
      </form>
    </AppShell>
  );
}
