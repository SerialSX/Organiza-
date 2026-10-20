import { useState } from 'react';
import { PlusIcon, MinusIcon, PencilIcon } from '../icons/AppIcons';
import { classeCampo } from '../ui/Campo';
import { formatarMoeda } from '../../lib/formatadores';

const LIMITE_OBSERVACAO = 140;

function BotaoQuantidade({ onClick, rotulo, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      className="w-11 h-11 inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)]"
    >
      {children}
    </button>
  );
}

export default function LinhaDoPedido({ linha, onQuantidade, onObservacao }) {
  const { nome, quantidade, observacao, preco } = linha;
  const [editando, setEditando] = useState(false);
  const mostrarCampo = editando || observacao !== '';

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--text-primary)] break-words">{nome}</p>
          <p className="text-sm tabular-nums text-[var(--text-secondary)]">{formatarMoeda(preco * quantidade)}</p>
        </div>
        <BotaoQuantidade onClick={() => onQuantidade(-1)} rotulo={quantidade === 1 ? `Tirar ${nome} do pedido` : `Tirar um ${nome}`}>
          <MinusIcon className="w-5 h-5" />
        </BotaoQuantidade>
        <span className="w-7 text-center font-bold tabular-nums text-[var(--text-primary)]" aria-label={`${quantidade} ${nome}`}>
          {quantidade}
        </span>
        <BotaoQuantidade onClick={() => onQuantidade(1)} rotulo={`Mais um ${nome}`}>
          <PlusIcon className="w-5 h-5" />
        </BotaoQuantidade>
      </div>

      {mostrarCampo ? (
        <input
          type="text"
          value={observacao}
          onChange={(e) => onObservacao(e.target.value.slice(0, LIMITE_OBSERVACAO))}
          onBlur={() => setEditando(false)}
          autoFocus={editando && observacao === ''}
          maxLength={LIMITE_OBSERVACAO}
          placeholder="Ex.: sem salada…"
          aria-label={`Observação de ${nome}`}
          autoComplete="off"
          enterKeyHint="done"
          className={classeCampo}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="self-start inline-flex items-center gap-1.5 min-h-11 -ml-1 px-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <PencilIcon className="w-4 h-4" />
          Adicionar observação
        </button>
      )}
    </li>
  );
}
