import Campo from '../ui/Campo';
import Botao from '../ui/Botao';
import { destinoDoPedido } from '../../lib/formatadores';

const ACCENT = 'var(--color-accent-pedidos)';

const OPCOES = [
  { tipo: 'balcao', rotulo: 'Balcão', dica: 'Retira pela senha' },
  { tipo: 'mesa', rotulo: 'Mesa', dica: 'Consumo no salão' },
];

// Para onde vai o pedido: balcão (o cliente retira quando chamam a senha) ou
// mesa (consumo no salão). destino: { tipo: 'balcao' | 'mesa', mesa: '12' }.
// escolhe: só o negócio que atende dos dois jeitos escolhe a cada pedido; nos
// outros, aparece só o número da mesa (quando é mesa).
// noMapa: a mesa é escolhida tocando no mapa das mesas (sem digitar).
export default function DestinoDoPedido({ destino, onMudar, erroMesa, idCampoMesa, escolhe = true, noMapa = false, onEscolherNoMapa }) {
  function escolher(tipo) {
    onMudar({ ...destino, tipo });
    // Escolheu mesa: o próximo passo é digitar o número (ou tocar no mapa).
    if (tipo === 'mesa' && noMapa && !destino.mesa) setTimeout(() => onEscolherNoMapa?.(), 0);
    else if (tipo === 'mesa') setTimeout(() => document.getElementById(idCampoMesa)?.focus(), 0);
  }

  const mesaDoMapa = destino.tipo === 'mesa' && noMapa && (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-3 py-2" style={{
        borderColor: destino.mesa ? ACCENT : erroMesa ? 'var(--color-accent-cozinha)' : 'var(--border-subtle)',
      }}>
        <p className="min-w-0 break-words text-[var(--text-primary)]">
          {destino.mesa ? (
            <>
              <span className="text-sm text-[var(--text-secondary)]">Pedido para a </span>
              <strong className="text-lg">{destinoDoPedido({ mesa: destino.mesa, nome_mesa: destino.nomeMesa })}</strong>
            </>
          ) : (
            <span className="text-sm font-medium">Nenhuma mesa escolhida.</span>
          )}
        </p>
        <Botao variante="secundaria" onClick={onEscolherNoMapa}>
          {destino.mesa ? 'Trocar a mesa' : 'Escolher a mesa'}
        </Botao>
      </div>
      {erroMesa && <p className="text-sm font-medium text-[var(--texto-cozinha)]">{erroMesa}</p>}
    </div>
  );

  const campoMesa = noMapa ? mesaDoMapa : destino.tipo === 'mesa' && (
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
  );

  if (!escolhe) return campoMesa || null;

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
      {campoMesa}
    </fieldset>
  );
}
