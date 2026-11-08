import { useState } from 'react';
import { SearchIcon, CloseIcon } from '../icons/AppIcons';
import { classeCampo } from '../ui/Campo';
import { formatarMoeda } from '../../lib/formatadores';
import { algumTamanhoDisponivel, tamanhoDisponivel } from '../../lib/tamanhos';
import { saboresParaCombinar } from '../../lib/meioAMeio';

const ACCENT = 'var(--color-accent-pedidos)';
// Com cardápio pequeno a busca só atrapalha; a partir daqui ela aparece.
const MOSTRAR_BUSCA_A_PARTIR_DE = 12;

function semAcento(texto) {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function Contador({ qtd, className = '' }) {
  if (!qtd) return null;
  return (
    <span
      aria-hidden="true"
      className={`min-w-7 h-7 px-1.5 inline-flex items-center justify-center rounded-full text-sm font-bold tabular-nums text-[var(--sobre-destaque)] ${className}`}
      style={{ backgroundColor: ACCENT }}
    >
      {qtd}
    </span>
  );
}

// "Meio a meio": abre a escolha do tamanho e da outra metade.
function BotaoMeioAMeio({ produto, qtd, onMeioAMeio, className = '' }) {
  return (
    <button
      type="button"
      onClick={() => onMeioAMeio(produto)}
      aria-label={`${produto.nome} meio a meio${qtd ? `, ${qtd} no pedido` : ''}`}
      className={`relative min-h-11 rounded-xl border-2 px-3 text-sm font-semibold text-[var(--texto-pedidos)] transition-transform active:scale-[0.97] ${className}`}
      style={{ borderColor: qtd ? ACCENT : 'var(--border-subtle)' }}
    >
      ½ Meio a meio
      {qtd > 0 && <span className="tabular-nums"> · {qtd}</span>}
    </button>
  );
}

// Pode abrir o meio a meio: marcado, com algum sabor para combinar, e o banco
// já com a migração (meioAMeio ligado).
function temMeioAMeio(produtos, produto, ligado) {
  if (!ligado || !produto.meio_a_meio || !algumTamanhoDisponivel(produto)) return false;
  if (!produto.tamanhos?.length) return saboresParaCombinar(produtos, produto, null).length > 0;
  return produto.tamanhos.some((t) => saboresParaCombinar(produtos, produto, t).length > 0);
}

// Produto com tamanhos: um botão por tamanho, sempre à vista. Um toque já
// adiciona aquele tamanho (não há tamanho escolhido de antemão).
function CartaoComTamanhos({ produto, quantidadePorProduto, onAdicionar, onEsgotado, meioAMeio, onMeioAMeio }) {
  const total = quantidadePorProduto[produto.id] ?? 0;
  const sai = algumTamanhoDisponivel(produto);
  return (
    <li className="col-span-2">
      <div
        role="group"
        aria-label={`${produto.nome}${sai ? '' : ', esgotado'}`}
        className="rounded-2xl border-2 bg-[var(--surface-card)] p-3 flex flex-col gap-2"
        style={{ borderColor: total ? ACCENT : 'var(--border-subtle)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`px-1 font-semibold leading-tight break-words hyphens-auto min-w-0 ${sai ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
          >
            {produto.nome}
            {!sai && <span className="font-normal"> · Esgotado</span>}
          </span>
          {meioAMeio && (
            <BotaoMeioAMeio produto={produto} qtd={quantidadePorProduto[`meio|${produto.id}`] ?? 0} onMeioAMeio={onMeioAMeio} />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {produto.tamanhos.map((t) => {
            const disponivel = tamanhoDisponivel(produto, t);
            const qtd = quantidadePorProduto[`${produto.id}|${t.id}`] ?? 0;
            return (
              <button
                key={t.id}
                type="button"
                // aria-disabled em vez de disabled: o toque ainda chega, para
                // avisar que esgotou e contar a venda evitada.
                aria-disabled={!disponivel || undefined}
                onClick={() => (disponivel ? onAdicionar(produto, t) : onEsgotado?.(produto, t))}
                aria-label={
                  disponivel
                    ? `Adicionar ${produto.nome} ${t.nome}, ${formatarMoeda(t.preco)}${qtd ? `, ${qtd} no pedido` : ''}`
                    : `${produto.nome} ${t.nome}, esgotado`
                }
                className="relative flex-1 min-w-[5.5rem] min-h-16 rounded-xl border-2 px-2 py-2 flex flex-col items-center justify-center gap-0.5 transition-[transform,border-color] active:scale-[0.97] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:active:scale-100"
                style={{ borderColor: qtd ? ACCENT : 'var(--border-subtle)' }}
              >
                <span
                  className={`text-lg font-bold leading-none ${disponivel ? 'text-[var(--text-primary)]' : 'line-through text-[var(--text-secondary)]'}`}
                >
                  {t.nome}
                </span>
                <span
                  className={`text-sm font-semibold tabular-nums ${disponivel ? 'text-[var(--texto-pedidos)]' : 'line-through text-[var(--text-secondary)]'}`}
                >
                  {formatarMoeda(t.preco)}
                </span>
                <Contador qtd={qtd} className="absolute top-1 right-1 min-w-6 h-6 text-xs" />
              </button>
            );
          })}
        </div>
      </div>
    </li>
  );
}

// onAdicionar(produto, tamanho): tamanho só no produto com tamanhos.
// onEsgotado: tocaram num produto (ou tamanho) esgotado, a venda que teria saído errada.
// meioAMeio: o banco aceita o meio a meio; onMeioAMeio(produto) abre a escolha.
export default function GradeDeProdutos({ produtos, quantidadePorProduto, onAdicionar, onEsgotado, meioAMeio = false, onMeioAMeio }) {
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
            if (p.tamanhos?.length) {
              return (
                <CartaoComTamanhos
                  key={p.id}
                  produto={p}
                  quantidadePorProduto={quantidadePorProduto}
                  onAdicionar={onAdicionar}
                  onEsgotado={onEsgotado}
                  meioAMeio={temMeioAMeio(produtos, p, meioAMeio)}
                  onMeioAMeio={onMeioAMeio}
                />
              );
            }
            // O contador do cartão é só do produto inteiro; o meio a meio conta no botão dele.
            const qtd = quantidadePorProduto[`${p.id}|`] ?? 0;
            const comMeio = temMeioAMeio(produtos, p, meioAMeio);
            return (
              <li key={p.id} className={comMeio ? 'flex flex-col gap-2' : undefined}>
                <button
                  type="button"
                  // aria-disabled em vez de disabled: o toque ainda chega, para
                  // avisar que esgotou e contar a venda evitada.
                  aria-disabled={!p.disponivel || undefined}
                  onClick={() => (p.disponivel ? onAdicionar(p) : onEsgotado?.(p))}
                  aria-label={
                    p.disponivel
                      ? `Adicionar ${p.nome}, ${formatarMoeda(p.preco)}${qtd ? `, ${qtd} no pedido` : ''}`
                      : `${p.nome}, esgotado`
                  }
                  className="relative w-full h-full min-h-28 text-left rounded-2xl border-2 bg-[var(--surface-card)] p-4 flex flex-col justify-between gap-2 transition-[transform,border-color] active:scale-[0.98] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:active:scale-100"
                  style={{ borderColor: qtd ? ACCENT : 'var(--border-subtle)' }}
                >
                  <span className="font-semibold text-[var(--text-primary)] leading-tight break-words hyphens-auto pr-9">{p.nome}</span>
                  <span
                    className="text-lg font-bold tabular-nums"
                    style={{ color: p.disponivel ? 'var(--texto-pedidos)' : 'var(--text-secondary)' }}
                  >
                    {p.disponivel ? formatarMoeda(p.preco) : 'Esgotado'}
                  </span>
                  <Contador qtd={qtd} className="absolute top-3 right-3 min-w-8 h-8 px-2" />
                </button>
                {comMeio && (
                  <BotaoMeioAMeio produto={p} qtd={quantidadePorProduto[`meio|${p.id}`] ?? 0} onMeioAMeio={onMeioAMeio} className="w-full" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
