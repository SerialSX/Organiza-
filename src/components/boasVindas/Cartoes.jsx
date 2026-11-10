// Cartões grandes de escolha (um rádio por cartão). Passar o mouse ou
// escolher deixa a borda laranja. Usado nas perguntas de boas-vindas e em
// Minha conta.
export function GrupoDeCartoes({ legenda, legendaVisivel = false, colunas = 'sm:grid-cols-3', children }) {
  return (
    <fieldset className="flex flex-col gap-3 min-w-0">
      <legend className={legendaVisivel ? 'mb-2 text-sm font-medium text-[var(--text-secondary)]' : 'sr-only'}>{legenda}</legend>
      <div className={`grid grid-cols-1 ${colunas} gap-3`}>{children}</div>
    </fieldset>
  );
}

export function Cartao({ nome, valor, marcado, onEscolher, icone, titulo, children }) {
  return (
    <label
      className={`relative flex flex-col gap-2 rounded-2xl border-2 p-4 sm:p-5 cursor-pointer transition-colors hover:border-[var(--color-brand-orange)] has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--cor-foco)] ${
        marcado ? 'border-[var(--color-brand-orange)]' : 'border-[var(--border-subtle)]'
      }`}
      style={{
        backgroundColor: marcado ? 'color-mix(in srgb, var(--color-brand-orange) 12%, var(--surface-card))' : 'var(--surface-card)',
      }}
    >
      <input type="radio" name={nome} value={valor} checked={marcado} onChange={onEscolher} className="sr-only" />
      <span className="flex items-start justify-between gap-3">
        <span aria-hidden="true" className="text-3xl leading-none">
          {icone}
        </span>
        <span
          aria-hidden="true"
          className={`inline-flex items-center justify-center w-6 h-6 rounded-full border-2 shrink-0 text-xs font-bold ${
            marcado ? 'border-[var(--color-brand-orange)] text-[var(--sobre-destaque)]' : 'border-[var(--borda-campo)]'
          }`}
          style={marcado ? { backgroundColor: 'var(--color-brand-orange)' } : undefined}
        >
          {marcado ? '✓' : ''}
        </span>
      </span>
      <span className="text-lg font-bold leading-snug text-[var(--text-primary)]">{titulo}</span>
      {children}
    </label>
  );
}
