import { useId } from 'react';
import Botao from '../ui/Botao';
import { classeCampo } from '../ui/Campo';
import { TrashIcon } from '../icons/AppIcons';
import { custoDaLinha } from '../../lib/custos';
import { formatarMoeda, lerValor } from '../../lib/formatadores';

// O que vai no produto e quanto de cada ("120 g de carne, 1 pão"). Serve para
// estimar o custo e para a cozinha avisar qual ingrediente faltou.
// lista: [{ ingrediente_id, quantidade }], com a quantidade ainda como texto do campo.
export default function IngredientesDoProduto({ lista, onMudar, ingredientes, erro, onIrParaIngredientes, nomeProduto }) {
  const idSelecao = useId();
  const porId = Object.fromEntries(ingredientes.map((i) => [i.id, i]));
  const naLista = new Set(lista.map((l) => l.ingrediente_id));
  const disponiveis = ingredientes.filter((i) => !naLista.has(i.id));
  const produto = nomeProduto.trim() || 'o produto';

  function adicionar(e) {
    const id = e.target.value;
    if (!id) return;
    onMudar([...lista, { ingrediente_id: id, quantidade: '' }]);
    e.target.value = '';
  }

  function mudarQuantidade(id, quantidade) {
    onMudar(lista.map((l) => (l.ingrediente_id === id ? { ...l, quantidade } : l)));
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] p-4">
      <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">Ingredientes (opcional)</legend>
      <p className="text-xs text-[var(--text-secondary)] -mt-1">
        Com os ingredientes, o custo é calculado sozinho e a cozinha avisa exatamente o que faltou.
      </p>

      {ingredientes.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Nenhum ingrediente cadastrado ainda.{' '}
          <button type="button" onClick={onIrParaIngredientes} className="font-semibold text-[var(--texto-laranja)] underline">
            Cadastrar ingredientes
          </button>
        </p>
      ) : (
        <>
          {lista.length > 0 && (
            <ul className="flex flex-col gap-2">
              {lista.map(({ ingrediente_id: id, quantidade }) => {
                const ingrediente = porId[id];
                if (!ingrediente) return null;
                const valor = lerValor(quantidade);
                const custo = Number.isFinite(valor) && valor > 0 ? custoDaLinha(ingrediente, valor) : null;
                return (
                  <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="basis-full sm:basis-auto sm:flex-1 min-w-0 font-medium text-[var(--text-primary)] break-words">
                      {ingrediente.nome}
                    </span>
                    <span className="flex items-center gap-2">
                      <input
                        value={quantidade}
                        onChange={(e) => mudarQuantidade(id, e.target.value)}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        aria-label={`Quanto vai de ${ingrediente.nome} em ${produto}, em ${ingrediente.unidade}`}
                        aria-invalid={erro && !(valor > 0) ? true : undefined}
                        className={`${classeCampo.replace('w-full', '')} w-24 text-right tabular-nums`}
                      />
                      <span className="w-6 text-sm text-[var(--text-secondary)]">{ingrediente.unidade}</span>
                    </span>
                    <span className="flex-1 sm:flex-none sm:w-24 text-right text-sm tabular-nums text-[var(--text-secondary)]">
                      {ingrediente.preco_compra === null ? 'sem preço' : custo === null ? '' : formatarMoeda(custo)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onMudar(lista.filter((l) => l.ingrediente_id !== id))}
                      aria-label={`Tirar ${ingrediente.nome} do produto`}
                      className="w-11 h-11 inline-flex items-center justify-center rounded-xl text-[var(--texto-cozinha)] hover:bg-[var(--surface-card-hover)]"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {erro && <p className="text-sm font-medium text-[var(--texto-cozinha)]">{erro}</p>}

          {disponiveis.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={idSelecao} className="sr-only">
                Adicionar ingrediente
              </label>
              <select id={idSelecao} defaultValue="" onChange={adicionar} className={`${classeCampo} sm:w-auto`}>
                <option value="">+ Adicionar ingrediente</option>
                {disponiveis.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome} ({i.unidade})
                  </option>
                ))}
              </select>
              <Botao variante="texto" onClick={onIrParaIngredientes}>
                Cadastrar outro
              </Botao>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
