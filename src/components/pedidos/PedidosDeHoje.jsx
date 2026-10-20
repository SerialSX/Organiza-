import { useState } from 'react';
import Botao from '../ui/Botao';
import Etiqueta from '../ui/Etiqueta';
import CancelarPedido from '../CancelarPedido';
import { CheckIcon, PencilIcon, AlertIcon } from '../icons/AppIcons';
import { atualizarStatusPedido } from '../../services/pedidos';
import { numeroDoPedido } from '../../lib/formatadores';
import { STATUS, podeEditar } from '../../lib/pedidoStatus';
import { itensQueFaltaram } from '../../lib/fila';

function resumoDosItens(pedido) {
  return pedido.itens.map((i) => `${i.quantidade}× ${i.nome}${i.observacao ? ` (${i.observacao})` : ''}`).join(', ');
}

function CartaoPedidoDeHoje({ pedido, editandoEste, onEditar, onErro }) {
  const [entregando, setEntregando] = useState(false);
  const faltaram = itensQueFaltaram(pedido);
  const pronto = pedido.status === 'pronto';
  const borda = faltaram.length ? 'var(--color-accent-cozinha)' : pronto ? STATUS.pronto.cor : 'var(--border-subtle)';

  async function entregar() {
    setEntregando(true);
    try {
      await atualizarStatusPedido(pedido.id, 'entregue');
    } catch (e) {
      onErro(e.message);
      setEntregando(false);
    }
  }

  return (
    <li className="rounded-2xl border-2 p-4 bg-[var(--surface-card)] flex flex-col gap-3" style={{ borderColor: borda }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{numeroDoPedido(pedido)}</span>
        <Etiqueta cor={STATUS[pedido.status].cor}>{STATUS[pedido.status].rotulo}</Etiqueta>
        {editandoEste && <span className="text-sm font-semibold text-[var(--text-secondary)]">Você está editando</span>}
      </div>

      {faltaram.length > 0 && (
        <p className="flex items-start gap-2 text-sm font-semibold text-[var(--texto-cozinha)]">
          <AlertIcon className="w-5 h-5 shrink-0" />
          A cozinha avisou que faltou: {faltaram.map((i) => i.nome).join(', ')}. Edite ou cancele o pedido.
        </p>
      )}

      <p className="text-sm text-[var(--text-secondary)] break-words">{resumoDosItens(pedido)}</p>

      <div className="flex flex-wrap items-center gap-2">
        {pronto && (
          <Botao cor={STATUS.pronto.cor} onClick={entregar} disabled={entregando}>
            <CheckIcon className="w-5 h-5" />
            Entregue
          </Botao>
        )}
        {podeEditar(pedido) && !editandoEste && (
          <Botao variante="secundaria" onClick={onEditar}>
            <PencilIcon className="w-4 h-4" />
            Editar
          </Botao>
        )}
        <CancelarPedido pedidoId={pedido.id} onErro={onErro} />
      </div>
    </li>
  );
}

export default function PedidosDeHoje({ prontos, fila, idEmEdicao, onEditar, onErro }) {
  if (!prontos.length && !fila.length) return null;

  return (
    <div className="mt-10 flex flex-col gap-8">
      {prontos.length > 0 && (
        <section aria-labelledby="titulo-prontos">
          <h2 id="titulo-prontos" className="text-lg font-semibold text-[var(--text-primary)] mb-3">
            Prontos para entregar
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {prontos.map((p) => (
              <CartaoPedidoDeHoje key={p.id} pedido={p} onErro={onErro} onEditar={() => onEditar(p)} />
            ))}
          </ul>
        </section>
      )}
      {fila.length > 0 && (
        <section aria-labelledby="titulo-na-cozinha">
          <h2 id="titulo-na-cozinha" className="text-lg font-semibold text-[var(--text-primary)] mb-3">
            Na cozinha
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fila.map((p) => (
              <CartaoPedidoDeHoje
                key={p.id}
                pedido={p}
                editandoEste={p.id === idEmEdicao}
                onErro={onErro}
                onEditar={() => onEditar(p)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
