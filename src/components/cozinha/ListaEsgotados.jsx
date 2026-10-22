import { useState } from 'react';
import Botao from '../ui/Botao';
import Carregando from '../ui/Carregando';
import EstadoVazio from '../ui/EstadoVazio';
import { BoxIcon } from '../icons/AppIcons';
import { useProdutos } from '../../hooks/useProdutos';
import { useIngredientes } from '../../hooks/useIngredientes';
import { atualizarProduto } from '../../services/produtos';

const VERMELHO = 'var(--color-accent-cozinha)';

// "Acabou o queijo": um toque esgota todos os produtos que levam queijo, em
// vez de a cozinha lembrar um por um. Voltar é produto a produto, porque um
// deles pode estar esgotado por outro motivo.
function AcabouIngrediente({ produtos, onErro }) {
  const { ingredientes } = useIngredientes();
  const [escolhido, setEscolhido] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const usam = (id) => produtos.filter((p) => p.disponivel && p.ingredientes.some((l) => l.ingrediente_id === id));
  const opcoes = ingredientes.filter((i) => usam(i.id).length > 0);
  if (!opcoes.length && !escolhido) return null;

  const afetados = escolhido ? usam(escolhido.id) : [];

  async function esgotar() {
    setSalvando(true);
    try {
      for (const p of afetados) await atualizarProduto(p.id, { disponivel: false });
      setEscolhido(null);
    } catch (e) {
      onErro(e.message);
    }
    setSalvando(false);
  }

  return (
    <section aria-labelledby="titulo-acabou" className="mb-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
      <h2 id="titulo-acabou" className="font-semibold text-[var(--text-primary)]">
        Acabou um ingrediente?
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mb-3">Toque nele para esgotar de uma vez os produtos que o levam.</p>
      {escolhido ? (
        <div role="group" aria-label={`Esgotar produtos com ${escolhido.nome}`} className="flex flex-col gap-3">
          <p className="text-[var(--text-primary)]">
            Esgotar {afetados.length ? afetados.map((p) => p.nome).join(', ') : 'nada (já estão esgotados)'}?
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao variante="perigo" onClick={esgotar} disabled={salvando || !afetados.length}>
              {salvando ? 'Salvando…' : 'Sim, esgotar'}
            </Botao>
            <Botao variante="secundaria" onClick={() => setEscolhido(null)}>
              Não
            </Botao>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {opcoes.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setEscolhido(i)}
              className="min-h-11 rounded-lg border border-[var(--border-subtle)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)]"
            >
              {i.nome}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ListaEsgotados({ onErro }) {
  const { produtos, carregando } = useProdutos();

  async function alternar(produto) {
    try {
      await atualizarProduto(produto.id, { disponivel: !produto.disponivel });
    } catch (e) {
      onErro(e.message);
    }
  }

  if (carregando) return <Carregando texto="Carregando produtos…" />;

  if (!produtos.length) {
    return <EstadoVazio icon={BoxIcon} accent={VERMELHO} titulo="Nenhum produto cadastrado" />;
  }

  return (
    <>
      <AcabouIngrediente produtos={produtos} onErro={onErro} />
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Toque no produto para marcar como esgotado ou avisar que voltou. A tela de pedidos bloqueia na hora.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {produtos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => alternar(p)}
              aria-pressed={!p.disponivel}
              aria-label={p.disponivel ? `${p.nome}, tem. Tocar marca como esgotado` : `${p.nome}, esgotado. Tocar marca que voltou`}
              className="w-full min-h-16 flex items-center gap-3 rounded-2xl border-2 bg-[var(--surface-card)] p-4 text-left transition-colors"
              style={{ borderColor: p.disponivel ? 'var(--border-subtle)' : VERMELHO }}
            >
              <span className="flex-1 min-w-0 font-semibold text-[var(--text-primary)] break-words">{p.nome}</span>
              <span
                className="shrink-0 rounded-xl px-3 py-2 text-sm font-bold text-[var(--sobre-destaque)]"
                style={{ backgroundColor: p.disponivel ? 'var(--color-accent-relatorios)' : VERMELHO }}
              >
                {p.disponivel ? 'Tem' : 'Esgotado'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
