import { useState } from 'react';
import Botao from '../ui/Botao';
import Etiqueta from '../ui/Etiqueta';
import { AlertIcon, CheckIcon, ClockIcon } from '../icons/AppIcons';
import { chamadaDoPedido, formatarEspera, formatarHora, minutosDesde, numeroDoPedido } from '../../lib/formatadores';
import { LIMITE_ATRASO_MINUTOS } from '../../lib/pedidoStatus';

const VERMELHO = 'var(--color-accent-cozinha)';
const VERDE = 'var(--color-accent-relatorios)';

const botaoFaltou = 'shrink-0 min-h-11 rounded-lg px-3 text-sm font-bold border transition-colors';

function estiloMarcado(marcado) {
  return marcado
    ? { backgroundColor: VERMELHO, borderColor: VERMELHO, color: 'var(--sobre-destaque)' }
    : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' };
}

// Produto com ingredientes cadastrados: "Faltou" abre a lista e a cozinha
// toca no que não tem ("queijo"). Sem ingredientes cadastrados, "Faltou"
// avisa o item inteiro.
function ItemDaFila({ item, onFaltou, onFaltouIngrediente }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const porIngrediente = item.ingredientes.length > 0;
  const faltaram = item.faltou_ingredientes;
  const riscado = item.faltou ? 'line-through' : 'none';
  const idLista = `faltou-${item.id}`;

  return (
    <li className="flex flex-col gap-2 text-lg">
      <div className="flex items-start gap-3">
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
          {faltaram.length > 0 && (
            <span className="mt-1 block text-base font-bold text-[var(--texto-cozinha)] break-words">
              Faltou: {faltaram.join(', ').toLowerCase()}
            </span>
          )}
        </span>
        {porIngrediente ? (
          <button
            type="button"
            onClick={() => setEscolhendo((e) => !e)}
            aria-expanded={escolhendo}
            aria-controls={idLista}
            aria-label={`Avisar que faltou um ingrediente de ${item.nome}`}
            className={botaoFaltou}
            style={estiloMarcado(faltaram.length > 0)}
          >
            Faltou{faltaram.length > 0 ? ` (${faltaram.length})` : ''}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onFaltou(item)}
            aria-pressed={item.faltou}
            aria-label={item.faltou ? `Faltou ${item.nome}. Tocar desfaz o aviso` : `Avisar que faltou ${item.nome}`}
            className={botaoFaltou}
            style={estiloMarcado(item.faltou)}
          >
            Faltou
          </button>
        )}
      </div>

      {porIngrediente && escolhendo && (
        <div
          id={idLista}
          role="group"
          aria-label={`O que faltou para ${item.nome}?`}
          className="ml-13 flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] p-3"
        >
          <p className="text-sm font-semibold text-[var(--text-secondary)]">O que faltou? O atendente é avisado na hora.</p>
          <div className="flex flex-wrap gap-2">
            {item.ingredientes.map((ingrediente) => {
              const marcado = faltaram.includes(ingrediente.nome);
              return (
                <button
                  key={ingrediente.id}
                  type="button"
                  onClick={() => onFaltouIngrediente(item, ingrediente)}
                  aria-pressed={marcado}
                  className={botaoFaltou}
                  style={estiloMarcado(marcado)}
                >
                  {ingrediente.nome}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setEscolhendo(false)}
            className="self-start min-h-11 text-sm font-semibold underline text-[var(--text-secondary)]"
          >
            Fechar
          </button>
        </div>
      )}
    </li>
  );
}

// posicao: lugar na fila (1 = o mais antigo, o próximo a sair).
export default function CartaoFila({ pedido, posicao, agora, onPronto, onFaltou, onFaltouIngrediente }) {
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
      aria-label={`Pedido ${chamadaDoPedido(pedido)}`}
      className="rounded-2xl border-2 bg-[var(--surface-card)] p-4 sm:p-5 flex flex-col gap-4"
      style={{ borderColor: borda }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {posicao && (
          <span className="inline-flex min-w-10 items-center justify-center rounded-lg border-2 border-[var(--border-subtle)] px-1.5 py-0.5 text-base font-extrabold tabular-nums text-[var(--text-secondary)]">
            <span className="sr-only">Posição na fila: </span>
            {posicao}º
          </span>
        )}
        <span className="text-3xl font-extrabold tracking-wide tabular-nums text-[var(--text-primary)]" translate="no">
          {numeroDoPedido(pedido)}
        </span>
        {pedido.mesa ? (
          <span className="rounded-lg px-2.5 py-0.5 text-2xl font-extrabold tabular-nums bg-[var(--text-primary)] text-[var(--surface)]">
            Mesa {pedido.mesa}
          </span>
        ) : (
          <span className="text-base font-bold text-[var(--text-secondary)]">Balcão</span>
        )}
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
          <ItemDaFila key={item.id} item={item} onFaltou={onFaltou} onFaltouIngrediente={onFaltouIngrediente} />
        ))}
      </ul>

      <Botao cor={VERDE} tamanho="grande" larguraTotal className="mt-auto text-lg font-bold" onClick={marcarPronto} disabled={salvando}>
        <CheckIcon className="w-6 h-6" />
        {salvando ? 'Salvando…' : 'Pronto'}
      </Botao>
    </li>
  );
}
