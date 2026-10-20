import { useState } from 'react';
import Botao from '../ui/Botao';
import Etiqueta from '../ui/Etiqueta';
import { AlertIcon, CheckIcon, ClockIcon } from '../icons/AppIcons';
import { formatarEspera, formatarHora, minutosDesde, numeroDoPedido } from '../../lib/formatadores';
import { LIMITE_ATRASO_MINUTOS } from '../../lib/pedidoStatus';

const VERMELHO = 'var(--color-accent-cozinha)';
const VERDE = 'var(--color-accent-relatorios)';

function ItemDaFila({ item, onFaltou }) {
  const riscado = item.faltou ? 'line-through' : 'none';

  return (
    <li className="flex items-start gap-3 text-lg">
      <span className="font-extrabold min-w-10 tabular-nums text-[var(--text-primary)]" style={{ textDecoration: riscado }}>
        {item.quantidade}×
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-[var(--text-primary)] break-words" style={{ textDecoration: riscado }}>
          {item.nome}
        </span>
        {item.observacao && (
          <span className="mt-1 inline-block rounded-r-lg border-l-4 border-[var(--color-brand-orange)] px-2.5 py-1 text-base font-bold break-words bg-[color-mix(in_srgb,var(--color-brand-orange)_18%,transparent)] text-[var(--text-primary)]">
            {item.observacao}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => onFaltou(item)}
        aria-pressed={item.faltou}
        aria-label={item.faltou ? `Faltou ${item.nome}. Tocar desfaz o aviso` : `Avisar que faltou ${item.nome}`}
        className="shrink-0 min-h-11 rounded-lg px-3 text-sm font-bold border transition-colors"
        style={
          item.faltou
            ? { backgroundColor: VERMELHO, borderColor: VERMELHO, color: 'var(--sobre-destaque)' }
            : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }
        }
      >
        Faltou
      </button>
    </li>
  );
}

export default function CartaoFila({ pedido, agora, onPronto, onFaltou }) {
  const [salvando, setSalvando] = useState(false);
  const minutos = minutosDesde(pedido.criado_em, agora);
  const atrasado = minutos >= LIMITE_ATRASO_MINUTOS;
  const alterado = Boolean(pedido.alterado_em);
  const borda = atrasado ? VERMELHO : alterado ? 'var(--color-brand-orange)' : 'var(--color-accent-pedidos)';

  async function marcarPronto() {
    setSalvando(true);
    const deuCerto = await onPronto(pedido);
    if (!deuCerto) setSalvando(false);
  }

  return (
    <li
      aria-label={`Pedido ${numeroDoPedido(pedido)}`}
      className="rounded-2xl border-2 bg-[var(--surface-card)] p-4 sm:p-5 flex flex-col gap-4"
      style={{ borderColor: borda }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-3xl font-extrabold tracking-wide tabular-nums text-[var(--text-primary)]" translate="no">
          {numeroDoPedido(pedido)}
        </span>
        {alterado && <Etiqueta cor="var(--color-brand-orange)">Alterado às {formatarHora(pedido.alterado_em)}</Etiqueta>}
        <span
          className="ml-auto inline-flex items-center gap-1.5 font-bold tabular-nums"
          style={{ color: atrasado ? 'var(--texto-cozinha)' : 'var(--text-secondary)' }}
          title={`Chegou às ${formatarHora(pedido.criado_em)}`}
        >
          {atrasado ? <AlertIcon className="w-5 h-5" /> : <ClockIcon className="w-5 h-5" />}
          {formatarEspera(minutos)}
        </span>
      </div>

      {atrasado && (
        <p className="-mt-2 text-sm font-semibold text-[var(--texto-cozinha)]">
          Atrasado: esperando há mais de {LIMITE_ATRASO_MINUTOS} minutos
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {pedido.itens.map((item) => (
          <ItemDaFila key={item.id} item={item} onFaltou={onFaltou} />
        ))}
      </ul>

      <Botao cor={VERDE} tamanho="grande" larguraTotal className="mt-auto text-lg font-bold" onClick={marcarPronto} disabled={salvando}>
        <CheckIcon className="w-6 h-6" />
        {salvando ? 'Salvando…' : 'Pronto'}
      </Botao>
    </li>
  );
}
