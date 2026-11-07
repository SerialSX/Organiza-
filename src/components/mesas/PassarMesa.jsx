import { useState } from 'react';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import { passarMesa } from '../../services/mesas';
import { formatarMoeda } from '../../lib/formatadores';
import { rotuloDaMesa } from '../../lib/mesas';

const LARANJA = 'var(--color-brand-orange)';

// Passa a conta inteira para outra mesa. Mesa livre: só muda de lugar. Mesa
// ocupada: as duas contas viram uma só, e a tela confirma antes com os totais.
export default function PassarMesa({ mesa, mapa, onPassada, onVoltar }) {
  const [juntarCom, setJuntarCom] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const destinos = mapa.filter((m) => m.mesa !== mesa.mesa);

  async function passar(destino) {
    setSalvando(true);
    setErro('');
    try {
      const quantos = await passarMesa(
        mesa.pedidos.map((p) => p.id),
        destino.mesa,
        destino.nome,
      );
      if (quantos === 0) {
        setErro('Nada foi passado: a conta já tinha sido fechada ou mudou em outro aparelho.');
        setSalvando(false);
        return;
      }
      onPassada(
        destino.pedidos.length
          ? `${rotuloDaMesa(mesa)} juntou com a ${rotuloDaMesa(destino)}: a conta agora é ${formatarMoeda(mesa.total + destino.total)}.`
          : `A conta da ${rotuloDaMesa(mesa)} passou para a ${rotuloDaMesa(destino)}.`,
      );
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  if (juntarCom) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg text-[var(--text-primary)]">
          A <strong>{rotuloDaMesa(juntarCom)}</strong> já tem conta aberta. Juntar as duas?
        </p>
        <dl className="flex flex-col gap-2 rounded-2xl border border-[var(--border-subtle)] p-4 tabular-nums">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--text-secondary)]">{rotuloDaMesa(mesa)}</dt>
            <dd className="font-semibold">{formatarMoeda(mesa.total)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--text-secondary)]">{rotuloDaMesa(juntarCom)}</dt>
            <dd className="font-semibold">{formatarMoeda(juntarCom.total)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-[var(--border-subtle)] pt-2">
            <dt className="font-bold">Conta junta na {rotuloDaMesa(juntarCom)}</dt>
            <dd className="text-xl font-extrabold">{formatarMoeda(mesa.total + juntarCom.total)}</dd>
          </div>
        </dl>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Botao cor={LARANJA} tamanho="grande" onClick={() => passar(juntarCom)} disabled={salvando}>
            {salvando ? 'Juntando…' : 'Juntar as mesas'}
          </Botao>
          <Botao variante="secundaria" tamanho="grande" onClick={() => setJuntarCom(null)} disabled={salvando}>
            Voltar
          </Botao>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[var(--text-secondary)]">
        Para qual mesa vai a conta da <strong className="text-[var(--text-primary)]">{rotuloDaMesa(mesa)}</strong> (
        {formatarMoeda(mesa.total)})?
      </p>
      <ul className="grid grid-cols-4 gap-2">
        {destinos.map((d) => {
          const ocupada = d.pedidos.length > 0;
          return (
            <li key={d.mesa}>
              <button
                type="button"
                disabled={salvando}
                onClick={() => (ocupada ? setJuntarCom(d) : passar(d))}
                aria-label={`${rotuloDaMesa(d)}, ${ocupada ? `ocupada, ${formatarMoeda(d.total)}` : 'livre'}`}
                className="w-full min-h-16 rounded-2xl border-2 px-1 py-2 flex flex-col items-center justify-center text-center disabled:opacity-50"
                style={{
                  borderColor: ocupada ? LARANJA : 'var(--border-subtle)',
                  backgroundColor: ocupada ? `color-mix(in srgb, ${LARANJA} 18%, var(--surface-card))` : 'var(--surface-alt)',
                }}
              >
                <span className={`font-extrabold text-[var(--text-primary)] break-words max-w-full ${d.nome ? 'text-sm' : 'text-xl tabular-nums'}`}>
                  {d.nome || d.mesa}
                </span>
                <span className="text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
                  {ocupada ? formatarMoeda(d.total) : 'Livre'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {erro && <Aviso>{erro}</Aviso>}
      <Botao variante="secundaria" className="self-start" onClick={onVoltar} disabled={salvando}>
        ← Voltar
      </Botao>
    </div>
  );
}
