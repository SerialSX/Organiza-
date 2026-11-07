import { useState } from 'react';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import { MoneyIcon } from '../icons/AppIcons';
import { registrarPagamento, FORMAS_DE_PAGAMENTO } from '../../services/pedidos';
import { totalDoPedido } from '../../lib/caixa';
import { formatarHora, formatarMoeda, numeroDoPedido } from '../../lib/formatadores';

const VERDE = 'var(--color-accent-relatorios)';

// Quantos dos pedidos marcados o banco aceitou. Menos que o esperado: outro
// aparelho recebeu antes (ou o pedido foi cancelado).
function avisoDoRecebimento(quantos, esperados) {
  if (quantos === esperados) return '';
  if (quantos === 0) return 'Nada foi recebido: esses pedidos já tinham sido pagos em outro aparelho ou foram cancelados.';
  const faltaram = esperados - quantos;
  return faltaram === 1
    ? '1 dos pedidos já tinha sido pago em outro aparelho ou foi cancelado. Confira no Caixa.'
    : `${faltaram} dos pedidos já tinham sido pagos em outro aparelho ou foram cancelados. Confira no Caixa.`;
}

function Conta({ conta, onErro }) {
  const [fechando, setFechando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Na mesma mesa pode ter mais de um grupo (a mesa foi liberada e outro
  // cliente sentou). Cada pedido vem marcado; quem não for desta conta, desmarca.
  const [desmarcados, setDesmarcados] = useState(() => new Set());
  const [aviso, setAviso] = useState('');

  const marcados = conta.pedidos.filter((p) => !desmarcados.has(p.id));
  const totalMarcado = marcados.reduce((s, p) => s + totalDoPedido(p), 0);
  const varios = conta.pedidos.length > 1;

  function alternar(id) {
    setAviso('');
    setDesmarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function receber(forma) {
    if (!marcados.length) return;
    setSalvando(true);
    setAviso('');
    try {
      const quantos = await registrarPagamento(
        marcados.map((p) => p.id),
        forma,
      );
      const texto = avisoDoRecebimento(quantos, marcados.length);
      if (texto) setAviso(texto);
      else {
        setFechando(false);
        setDesmarcados(new Set());
      }
    } catch (e) {
      onErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <p className="flex-1 min-w-0 text-xl font-bold text-[var(--text-primary)] break-words">{conta.identificacao}</p>
        <p className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{formatarMoeda(conta.total)}</p>
      </div>
      {!fechando && (
        <p className="text-sm text-[var(--text-secondary)] tabular-nums">
          {conta.pedidos.length === 1 ? '1 pedido' : `${conta.pedidos.length} pedidos`}: senhas{' '}
          {conta.pedidos.map(numeroDoPedido).join(', ')}
        </p>
      )}
      {fechando ? (
        <>
          {varios && (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm text-[var(--text-secondary)] mb-1">
                Desmarque o pedido que não é de quem está pagando.
              </legend>
              {conta.pedidos.map((p) => (
                <label
                  key={p.id}
                  className="min-h-12 flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] px-3 py-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="w-5 h-5 shrink-0 accent-[var(--color-accent-relatorios)]"
                    checked={!desmarcados.has(p.id)}
                    onChange={() => alternar(p.id)}
                    disabled={salvando}
                  />
                  <span className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3">
                    <span className="font-bold tabular-nums text-[var(--text-primary)]">{numeroDoPedido(p)}</span>
                    <span className="text-sm tabular-nums text-[var(--text-secondary)]">{formatarHora(p.criado_em)}</span>
                    {p.identificacao && (
                      <span className="basis-full sm:basis-auto min-w-0 text-sm font-medium text-[var(--text-primary)] break-words">
                        {p.identificacao}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-[var(--text-primary)]">
                    {formatarMoeda(totalDoPedido(p))}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {varios && (
            <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]" aria-live="polite">
              {marcados.length
                ? `Receber ${formatarMoeda(totalMarcado)} (${marcados.length === 1 ? '1 pedido' : `${marcados.length} pedidos`})`
                : 'Marque pelo menos um pedido.'}
            </p>
          )}
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={`Receber ${formatarMoeda(totalMarcado)} de ${conta.identificacao}`}
          >
            {FORMAS_DE_PAGAMENTO.map((f) => (
              <Botao key={f.id} cor={VERDE} onClick={() => receber(f.id)} disabled={salvando || !marcados.length}>
                {f.rotulo}
              </Botao>
            ))}
            <Botao variante="secundaria" onClick={() => setFechando(false)} disabled={salvando}>
              Voltar
            </Botao>
          </div>
        </>
      ) : (
        <Botao cor={VERDE} className="self-start" onClick={() => setFechando(true)}>
          <MoneyIcon className="w-5 h-5" />
          Fechar a conta
        </Botao>
      )}
      {aviso && <Aviso tipo="info">{aviso}</Aviso>}
    </li>
  );
}

// A conta de cada mesa vai somando a noite toda; fecha tudo de uma vez ou só
// os pedidos de quem está pagando.
export default function ContasAbertas({ contas, onErro }) {
  if (!contas.length) return null;
  return (
    <section aria-labelledby="titulo-contas" className="mt-10">
      <h2 id="titulo-contas" className="text-lg font-semibold text-[var(--text-primary)] mb-3">
        Contas abertas
      </h2>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {contas.map((conta) => (
          <Conta key={conta.identificacao.toLowerCase()} conta={conta} onErro={onErro} />
        ))}
      </ul>
    </section>
  );
}
