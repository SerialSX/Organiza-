import { useState } from 'react';
import Botao from '../ui/Botao';
import Etiqueta from '../ui/Etiqueta';
import CancelarPedido from '../CancelarPedido';
import { CheckIcon, PencilIcon, AlertIcon } from '../icons/AppIcons';
import { atualizarStatusPedido, FORMAS_DE_PAGAMENTO } from '../../services/pedidos';
import { numeroDoPedido } from '../../lib/formatadores';
import { STATUS, podeEditar } from '../../lib/pedidoStatus';
import { descreverFalta, itensQueFaltaram } from '../../lib/fila';

const ROTULO_FORMA = Object.fromEntries(FORMAS_DE_PAGAMENTO.map((f) => [f.id, f.rotulo]));

function resumoDosItens(pedido) {
  return pedido.itens.map((i) => `${i.quantidade}× ${i.nome}${i.observacao ? ` (${i.observacao})` : ''}`).join(', ');
}

function CartaoPedidoDeHoje({ pedido, editandoEste, semTelaCozinha, onEditar, onErro }) {
  const [salvando, setSalvando] = useState(false);
  const faltaram = itensQueFaltaram(pedido);
  const pronto = pedido.status === 'pronto';
  const naFila = pedido.status === 'pendente' || pedido.status === 'em_preparo';
  const borda = faltaram.length ? 'var(--color-accent-cozinha)' : pronto ? STATUS.pronto.cor : 'var(--border-subtle)';

  async function mudarStatus(status) {
    setSalvando(true);
    try {
      await atualizarStatusPedido(pedido.id, status);
    } catch (e) {
      onErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <li className="rounded-2xl border-2 p-4 bg-[var(--surface-card)] flex flex-col gap-3" style={{ borderColor: borda }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{numeroDoPedido(pedido)}</span>
        {pedido.mesa && <span className="text-lg font-bold tabular-nums text-[var(--text-primary)]">Mesa {pedido.mesa}</span>}
        {pedido.identificacao && (
          <span className="text-lg font-bold text-[var(--text-primary)] break-words">{pedido.identificacao}</span>
        )}
        <Etiqueta cor={STATUS[pedido.status].cor}>{STATUS[pedido.status].rotulo}</Etiqueta>
        {pedido.forma_pagamento && <Etiqueta cor="var(--color-accent-relatorios)">Pago · {ROTULO_FORMA[pedido.forma_pagamento]}</Etiqueta>}
        {editandoEste && <span className="text-sm font-semibold text-[var(--text-secondary)]">Você está editando</span>}
      </div>

      {faltaram.length > 0 && (
        <p className="flex items-start gap-2 text-sm font-semibold text-[var(--texto-cozinha)]">
          <AlertIcon className="w-5 h-5 shrink-0" />
          A cozinha avisou que faltou: {faltaram.map(descreverFalta).join(', ')}. Combine com o cliente: edite o pedido (tire o item ou anote na observação) ou cancele.
        </p>
      )}

      <p className="text-sm text-[var(--text-secondary)] break-words">{resumoDosItens(pedido)}</p>

      <div className="flex flex-wrap items-center gap-2">
        {semTelaCozinha && naFila && (
          <Botao cor={STATUS.pronto.cor} onClick={() => mudarStatus('pronto')} disabled={salvando}>
            <CheckIcon className="w-5 h-5" />
            Pronto
          </Botao>
        )}
        {pronto && (
          <Botao cor={STATUS.pronto.cor} onClick={() => mudarStatus('entregue')} disabled={salvando}>
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

// semTelaCozinha: a cozinha fica do lado do balcão e o "Pronto" é marcado aqui.
export default function PedidosDeHoje({ prontos, fila, idEmEdicao, semTelaCozinha = false, onEditar, onErro }) {
  if (!prontos.length && !fila.length) return null;

  const cartao = (p) => (
    <CartaoPedidoDeHoje
      key={p.id}
      pedido={p}
      editandoEste={p.id === idEmEdicao}
      semTelaCozinha={semTelaCozinha}
      onErro={onErro}
      onEditar={() => onEditar(p)}
    />
  );

  return (
    <div className="mt-10 flex flex-col gap-8">
      {prontos.length > 0 && (
        <section aria-labelledby="titulo-prontos">
          <h2 id="titulo-prontos" className="text-lg font-semibold text-[var(--text-primary)] mb-3">
            Prontos para entregar
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">{prontos.map(cartao)}</ul>
        </section>
      )}
      {fila.length > 0 && (
        <section aria-labelledby="titulo-na-cozinha">
          <h2 id="titulo-na-cozinha" className="text-lg font-semibold text-[var(--text-primary)] mb-3">
            {semTelaCozinha ? 'Preparando' : 'Na cozinha'}
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">{fila.map(cartao)}</ul>
        </section>
      )}
    </div>
  );
}
