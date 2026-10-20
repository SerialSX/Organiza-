import Carregando from '../ui/Carregando';
import EstadoVazio from '../ui/EstadoVazio';
import { BoxIcon } from '../icons/AppIcons';
import { useProdutos } from '../../hooks/useProdutos';
import { atualizarProduto } from '../../services/produtos';

const VERMELHO = 'var(--color-accent-cozinha)';

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
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Acabou algum ingrediente? Toque no produto para marcar como esgotado. A tela de pedidos bloqueia na hora.
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
