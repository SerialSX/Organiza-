import { useState } from 'react';
import Botao from '../ui/Botao';
import Campo from '../ui/Campo';
import { formatarMoeda } from '../../lib/formatadores';
import { LIMITE_NOME_MESA, limparNomeMesa, rotuloDaMesa } from '../../lib/mesas';

export const ID_MAPA = 'mapa-das-mesas';
const LARANJA = 'var(--color-brand-orange)';

function descricao(mesa, escolhida) {
  const partes = [rotuloDaMesa(mesa)];
  if (mesa.pedidos.length) {
    partes.push(`ocupada, ${formatarMoeda(mesa.total)}`, mesa.pedidos.length === 1 ? '1 pedido' : `${mesa.pedidos.length} pedidos`);
  } else partes.push('livre');
  if (escolhida) partes.push('pedido sendo montado para esta mesa');
  return partes.join(', ');
}

function CartaoMesa({ mesa, escolhida, onTocar }) {
  const ocupada = mesa.pedidos.length > 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => onTocar(mesa)}
        aria-label={descricao(mesa, escolhida)}
        className={`relative w-full min-h-20 rounded-2xl border-2 px-2 py-2 flex flex-col items-center justify-center gap-0.5 text-center transition-[filter] hover:brightness-105 ${
          escolhida ? 'outline-3 outline-offset-2 outline-[var(--text-primary)]' : ''
        }`}
        style={{
          borderColor: ocupada ? LARANJA : 'var(--border-subtle)',
          backgroundColor: ocupada ? `color-mix(in srgb, ${LARANJA} 18%, var(--surface-card))` : 'var(--surface-alt)',
        }}
      >
        <span
          className={`font-extrabold leading-tight text-[var(--text-primary)] break-words max-w-full ${mesa.nome ? 'text-sm' : 'text-2xl tabular-nums'}`}
        >
          {mesa.nome || mesa.mesa}
        </span>
        <span className={`text-xs font-semibold tabular-nums ${ocupada ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          {ocupada ? formatarMoeda(mesa.total) : escolhida ? 'Novo pedido' : 'Livre'}
        </span>
      </button>
    </li>
  );
}

// Abre uma mesa a mais com nome (dia de movimento). O número fica acima das
// mesas do mapa e a mesa some quando a conta fecha.
function NovaMesaExtra({ sugestao, onAbrir, onCancelar }) {
  const [nome, setNome] = useState(sugestao.nome);
  const limpo = limparNomeMesa(nome);

  function abrir(e) {
    e.preventDefault();
    if (limpo) onAbrir({ mesa: sugestao.mesa, nome: limpo });
  }

  return (
    <form onSubmit={abrir} className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
      <Campo
        rotulo="Nome da mesa extra"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        maxLength={LIMITE_NOME_MESA}
        autoComplete="off"
        dica="Ex.: Varanda, Calçada. Ela some do mapa quando a conta fechar."
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <Botao type="submit" cor={LARANJA} disabled={!limpo}>
          Abrir mesa extra
        </Botao>
        <Botao variante="secundaria" onClick={onCancelar}>
          Voltar
        </Botao>
      </div>
    </form>
  );
}

// Mapa das mesas: livre (cinza) ou ocupada (laranja, com o total). Tocar na
// livre começa o pedido dela; na ocupada, abre a conta.
// escolhida: número da mesa do pedido que está sendo montado.
// sugestaoExtra: { mesa, nome } da próxima mesa extra (null: não cabe mais).
export default function MapaDeMesas({ mapa, escolhida, onEscolherLivre, onAbrirConta, sugestaoExtra, onAbrirExtra, aviso }) {
  const [criandoExtra, setCriandoExtra] = useState(false);
  const ocupadas = mapa.filter((m) => m.pedidos.length).length;

  function tocar(mesa) {
    if (mesa.pedidos.length) onAbrirConta(mesa);
    else onEscolherLivre(mesa);
  }

  return (
    <section id={ID_MAPA} aria-labelledby="titulo-mapa" className="mb-6 scroll-mt-24 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="titulo-mapa" className="text-lg font-semibold text-[var(--text-primary)]">
          Mesas
        </h2>
        <p className="text-sm text-[var(--text-secondary)] tabular-nums">
          {ocupadas === 0 ? 'Todas livres' : ocupadas === 1 ? '1 ocupada' : `${ocupadas} ocupadas`} · Toque na mesa
        </p>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {aviso}
      </div>
      <ul className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
        {mapa.map((m) => (
          <CartaoMesa key={m.mesa} mesa={m} escolhida={m.mesa === escolhida} onTocar={tocar} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="w-3 h-3 rounded-sm border-2 border-[var(--border-subtle)] bg-[var(--surface-alt)]" />
          Livre
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="w-3 h-3 rounded-sm border-2" style={{ borderColor: LARANJA, backgroundColor: LARANJA }} />
          Ocupada (com o total da conta)
        </span>
      </div>
      {criandoExtra && sugestaoExtra ? (
        <NovaMesaExtra
          sugestao={sugestaoExtra}
          onCancelar={() => setCriandoExtra(false)}
          onAbrir={(extra) => {
            setCriandoExtra(false);
            onAbrirExtra(extra);
          }}
        />
      ) : (
        sugestaoExtra && (
          <Botao variante="secundaria" className="self-start" onClick={() => setCriandoExtra(true)}>
            + Mesa extra
          </Botao>
        )
      )}
    </section>
  );
}
