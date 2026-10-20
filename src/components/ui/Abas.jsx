export default function Abas({ opcoes, valor, onMudar, cor, rotulo }) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="inline-flex flex-wrap rounded-xl border border-[var(--border-subtle)] p-1 bg-[var(--surface-card)]"
    >
      {opcoes.map(({ id, rotulo: texto, Icone }) => {
        const ativa = valor === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={ativa}
            onClick={() => onMudar(id)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              backgroundColor: ativa ? cor : 'transparent',
              color: ativa ? 'var(--sobre-destaque)' : 'var(--text-secondary)',
            }}
          >
            {Icone && <Icone className="w-5 h-5" />}
            {texto}
          </button>
        );
      })}
    </div>
  );
}
