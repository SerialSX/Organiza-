import { useState } from 'react';
import Botao from '../ui/Botao';
import { MoneyIcon } from '../icons/AppIcons';
import { registrarPagamento, FORMAS_DE_PAGAMENTO } from '../../services/pedidos';
import { formatarMoeda, numeroDoPedido } from '../../lib/formatadores';

const VERDE = 'var(--color-accent-relatorios)';

function Conta({ conta, onErro }) {
  const [fechando, setFechando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function receber(forma) {
    setSalvando(true);
    try {
      await registrarPagamento(
        conta.pedidos.map((p) => p.id),
        forma,
      );
    } catch (e) {
      onErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <p className="flex-1 min-w-0 text-xl font-bold text-[var(--text-primary)] break-words">{conta.identificacao}</p>
        <p className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{formatarMoeda(conta.total)}</p>
      </div>
      <p className="text-sm text-[var(--text-secondary)] tabular-nums">
        {conta.pedidos.length === 1 ? '1 pedido' : `${conta.pedidos.length} pedidos`}: senhas{' '}
        {conta.pedidos.map(numeroDoPedido).join(', ')}
      </p>
      {fechando ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Receber ${formatarMoeda(conta.total)} de ${conta.identificacao}`}>
          {FORMAS_DE_PAGAMENTO.map((f) => (
            <Botao key={f.id} cor={VERDE} onClick={() => receber(f.id)} disabled={salvando}>
              {f.rotulo}
            </Botao>
          ))}
          <Botao variante="secundaria" onClick={() => setFechando(false)} disabled={salvando}>
            Voltar
          </Botao>
        </div>
      ) : (
        <Botao cor={VERDE} className="self-start" onClick={() => setFechando(true)}>
          <MoneyIcon className="w-5 h-5" />
          Fechar a conta
        </Botao>
      )}
    </li>
  );
}

// A conta de cada mesa vai somando a noite toda; fecha tudo de uma vez.
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
