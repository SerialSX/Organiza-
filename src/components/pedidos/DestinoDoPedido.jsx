import Campo from '../ui/Campo';

const ACCENT = 'var(--color-accent-pedidos)';

const OPCOES = [
  { tipo: 'balcao', rotulo: 'Balcão', dica: 'Retira pela senha' },
  { tipo: 'mesa', rotulo: 'Mesa', dica: 'Consumo no salão' },
];

// Para onde vai o pedido: balcão (o cliente retira quando chamam a senha) ou
// mesa (consumo no salão). destino: { tipo: 'balcao' | 'mesa', mesa: '12' }.
export default function DestinoDoPedido({ destino, onMudar, erroMesa, idCampoMesa }) {
  function escolher(tipo) {
    onMudar({ ...destino, tipo });
    // Escolheu mesa: o próximo passo é digitar o número.
    if (tipo === 'mesa') setTimeout(() => document.getElementById(idCampoMesa)?.focus(), 0);
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Para onde vai o pedido?</legend>
      <div className="grid grid-cols-2 gap-2">
        {OPCOES.map(({ tipo, rotulo, dica }) => {
          const marcado = destino.tipo === tipo;
          return (
            <label
              key={tipo}
              className="cursor-pointer rounded-xl border-2 px-3 py-2.5 transition-colors has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--color-brand-orange)]"
              style={{
                borderColor: marcado ? ACCENT : 'var(--border-subtle)',
                backgroundColor: marcado ? `color-mix(in srgb, ${ACCENT} 15%, transparent)` : 'transparent',
              }}
            >
              <input
                type="radio"
                name="destino-do-pedido"
                value={tipo}
                checked={marcado}
                onChange={() => escolher(tipo)}
                className="sr-only"
              />
              <span className="block font-semibold text-[var(--text-primary)]">{rotulo}</span>
              <span className="block text-xs text-[var(--text-secondary)]">{dica}</span>
            </label>
          );
        })}
      </div>
      {destino.tipo === 'mesa' && (
        <Campo
          id={idCampoMesa}
          rotulo="Número da mesa"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ex.: 12"
          value={destino.mesa}
          onChange={(e) => onMudar({ ...destino, mesa: e.target.value.replace(/\D/g, '').slice(0, 3) })}
          erro={erroMesa}
        />
      )}
    </fieldset>
  );
}
