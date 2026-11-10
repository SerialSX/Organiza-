import Botao from '../ui/Botao';
import { classeCampo } from '../ui/Campo';
import { PlusIcon, TrashIcon } from '../icons/AppIcons';
import { formatarMoeda, lerValor } from '../../lib/formatadores';
import { LIMITE_NOME_TAMANHO, MAXIMO_DE_TAMANHOS, MINIMO_DE_TAMANHOS, TAMANHOS_RAPIDOS } from '../../lib/tamanhos';
import { preencherNomes, tamanhoVazio } from '../../lib/formularioProduto';

function Erro({ texto }) {
  return texto ? <p className="text-sm font-medium text-[var(--texto-cozinha)]">{texto}</p> : null;
}

// tamanhos: [{ chave, id?, nome, preco, custo, disponivel }], valores ainda como texto.
// estimados: { [chave]: custo pelos ingredientes ou null }.
export default function TamanhosDoProduto({ tamanhos, onMudar, estimados, erros, nomeProduto }) {
  const produto = nomeProduto.trim() || 'o produto';

  function mudar(chave, campo, valor) {
    onMudar(tamanhos.map((t) => (t.chave === chave ? { ...t, [campo]: valor } : t)));
  }


  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] p-4">
      <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">Tamanhos e preços</legend>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--text-secondary)]">Preencher:</span>
        {TAMANHOS_RAPIDOS.map((nomes) => (
          <Botao key={nomes.join()} variante="secundaria" onClick={() => onMudar(preencherNomes(tamanhos, nomes))}>
            {nomes.join(' · ')}
          </Botao>
        ))}
      </div>

      <Erro texto={erros.tamanhos} />

      <ul className="flex flex-col gap-3">
        {tamanhos.map((t, indice) => {
          const estimado = estimados[t.chave] ?? null;
          const custo = estimado ?? (t.custo.trim() === '' ? null : lerValor(t.custo));
          const venda = lerValor(t.preco);
          const lucro = custo !== null && venda > 0 ? venda - custo : null;
          const rotulo = t.nome.trim() || `tamanho ${indice + 1}`;
          const erroNome = erros[`tamanho-nome-${t.chave}`];
          const erroPreco = erros[`tamanho-preco-${t.chave}`];
          const erroCusto = erros[`tamanho-custo-${t.chave}`];
          return (
            <li key={t.chave} className="rounded-xl bg-[var(--surface)] p-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 w-28">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Tamanho</span>
                  <input
                    name={`tamanho-nome-${t.chave}`}
                    value={t.nome}
                    onChange={(e) => mudar(t.chave, 'nome', e.target.value)}
                    placeholder={['P', 'M', 'G'][indice] ?? 'Nome'}
                    maxLength={LIMITE_NOME_TAMANHO}
                    autoComplete="off"
                    aria-label={`Nome do tamanho ${indice + 1} de ${produto}`}
                    aria-invalid={erroNome ? true : undefined}
                    className={classeCampo}
                  />
                </label>
                <label className="flex flex-col gap-1 w-32">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Preço (R$)</span>
                  <input
                    name={`tamanho-preco-${t.chave}`}
                    value={t.preco}
                    onChange={(e) => mudar(t.chave, 'preco', e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`Preço de ${produto} ${rotulo}`}
                    aria-invalid={erroPreco ? true : undefined}
                    className={`${classeCampo} tabular-nums`}
                  />
                </label>
                {estimado === null ? (
                  <label className="flex flex-col gap-1 w-32">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Custo (opcional)</span>
                    <input
                      name={`tamanho-custo-${t.chave}`}
                      value={t.custo}
                      onChange={(e) => mudar(t.chave, 'custo', e.target.value)}
                      placeholder="0,00"
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`Custo de ${produto} ${rotulo}`}
                      aria-invalid={erroCusto ? true : undefined}
                      className={`${classeCampo} tabular-nums`}
                    />
                  </label>
                ) : (
                  <div className="flex flex-col gap-1 w-32" aria-live="polite">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Custo estimado</span>
                    <span className="min-h-12 flex items-center font-bold tabular-nums text-[var(--text-primary)]">
                      {formatarMoeda(estimado)}
                    </span>
                  </div>
                )}
                {tamanhos.length > MINIMO_DE_TAMANHOS && (
                  <button
                    type="button"
                    onClick={() => onMudar(tamanhos.filter((x) => x.chave !== t.chave))}
                    aria-label={`Tirar o tamanho ${rotulo}`}
                    className="w-11 h-12 inline-flex items-center justify-center rounded-xl text-[var(--texto-cozinha)] hover:bg-[var(--surface-card-hover)]"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
              <Erro texto={erroNome || erroPreco || erroCusto} />
              {lucro !== null && (
                <p
                  className="text-xs font-semibold tabular-nums"
                  style={{ color: lucro >= 0 ? 'var(--texto-relatorios)' : 'var(--texto-cozinha)' }}
                >
                  {lucro >= 0 ? `Lucro de ${formatarMoeda(lucro)} cada` : `Prejuízo de ${formatarMoeda(-lucro)} cada: o custo passou do preço`}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {tamanhos.length < MAXIMO_DE_TAMANHOS && (
        <Botao
          variante="secundaria"
          className="self-start"
          onClick={() => onMudar([...tamanhos, tamanhoVazio()])}
        >
          <PlusIcon className="w-5 h-5" />
          Adicionar tamanho
        </Botao>
      )}
      <p className="text-xs text-[var(--text-secondary)]">
        Na tela de pedidos, cada tamanho vira um botão com o preço. Tirar um tamanho não muda os pedidos que já foram feitos.
      </p>
    </fieldset>
  );
}
