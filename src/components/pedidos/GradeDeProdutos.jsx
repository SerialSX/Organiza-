import { useState } from 'react';
import { SearchIcon, CloseIcon } from '../icons/AppIcons';
import { classeCampo } from '../ui/Campo';
import { formatarMoeda } from '../../lib/formatadores';

const ACCENT = 'var(--color-accent-pedidos)';
// Com cardápio pequeno a busca só atrapalha; a partir daqui ela aparece.
const MOSTRAR_BUSCA_A_PARTIR_DE = 12;

function semAcento(texto) {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export default function GradeDeProdutos({ produtos, quantidadePorProduto, onAdicionar }) {
  const [busca, setBusca] = useState('');
  const termo = semAcento(busca.trim());
  const visiveis = termo ? produtos.filter((p) => semAcento(p.nome).includes(termo)) : produtos;

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {produtos.length >= MOSTRAR_BUSCA_A_PARTIR_DE && (
        <div className="relative">
          <SearchIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto…"
            aria-label="Buscar produto"
            autoComplete="off"
            enterKeyHint="search"
            className={`${classeCampo} pl-12 pr-12`}
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {visiveis.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-6 text-center">
          Nenhum produto com “{busca.trim()}”.
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visiveis.map((p) => {
            const qtd = quantidadePorProduto[p.id] ?? 0;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={!p.disponivel}
                  onClick={() => onAdicionar(p)}
                  aria-label={
                    p.disponivel
                      ? `Adicionar ${p.nome}, ${formatarMoeda(p.preco)}${qtd ? `, ${qtd} no pedido` : ''}`
                      : `${p.nome}, esgotado`
                  }
                  className="relative w-full h-full min-h-28 text-left rounded-2xl border-2 bg-[var(--surface-card)] p-4 flex flex-col justify-between gap-2 transition-[transform,border-color] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: qtd ? ACCENT : 'var(--border-subtle)' }}
                >
                  <span className="font-semibold text-[var(--text-primary)] leading-tight break-words pr-9">{p.nome}</span>
                  <span
                    className="text-lg font-bold tabular-nums"
                    style={{ color: p.disponivel ? 'var(--texto-pedidos)' : 'var(--text-secondary)' }}
                  >
                    {p.disponivel ? formatarMoeda(p.preco) : 'Esgotado'}
                  </span>
                  {qtd > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-3 right-3 min-w-8 h-8 px-2 inline-flex items-center justify-center rounded-full text-sm font-bold tabular-nums text-[var(--sobre-destaque)]"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {qtd}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
