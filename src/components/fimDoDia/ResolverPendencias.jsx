import { useState } from 'react';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import Etiqueta from '../ui/Etiqueta';
import CancelarPedido from '../CancelarPedido';
import Janela from '../mesas/Janela';
import FecharMesa from '../mesas/FecharMesa';
import { AlertIcon, CheckIcon } from '../icons/AppIcons';
import { registrarPagamento, FORMAS_DE_PAGAMENTO, ROTULO_FORMA } from '../../services/pedidos';
import { cancelarConta, marcarEntregues, marcarNaoRecebido } from '../../services/fimDoDia';
import { destinoDoPedido, formatarMoeda, numeroDoPedido } from '../../lib/formatadores';
import { MOTIVOS_CANCELAMENTO, STATUS } from '../../lib/pedidoStatus';
import { totalDoPedido } from '../../lib/caixa';
import { pendenciasDoDia, quantosPedidos } from '../../lib/fimDoDia';
import { rotuloDaMesa } from '../../lib/mesas';
import { resumoDosItens as juntarItens } from '../../lib/combos';

const LARANJA = 'var(--color-brand-orange)';
const VERDE = 'var(--color-accent-relatorios)';
const VERMELHO = 'var(--color-accent-cozinha)';
const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const classeCartao = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 flex flex-col gap-3 min-w-0';
const classeOpcao = 'rounded-xl px-3 py-3 text-sm font-semibold text-[var(--sobre-destaque)] disabled:opacity-60';
const classeVoltar = 'self-start min-h-11 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]';

function doDia(dia) {
  return `Pedido de ${dataCurta.format(new Date(`${dia}T12:00:00Z`))}`;
}

function resumoDosItens(pedido) {
  return juntarItens(pedido.itens);
}

// Pedido pago que ainda não saiu: na cozinha ou pronto sem marcar entregue.
function CartaoAEntregar({ pedido, mostrarDia, onErro }) {
  const [salvando, setSalvando] = useState(false);
  const forma = ROTULO_FORMA[pedido.forma_pagamento];

  async function entregue() {
    setSalvando(true);
    onErro('');
    try {
      await marcarEntregues([pedido.id]);
    } catch (e) {
      onErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <li className={classeCartao}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{numeroDoPedido(pedido)}</span>
        {pedido.mesa && <span className="font-bold text-[var(--text-primary)] break-words">{destinoDoPedido(pedido)}</span>}
        {pedido.identificacao && <span className="font-bold text-[var(--text-primary)] break-words">{pedido.identificacao}</span>}
        <Etiqueta cor={STATUS[pedido.status].cor}>{STATUS[pedido.status].rotulo}</Etiqueta>
        {mostrarDia && <span className="text-sm tabular-nums text-[var(--text-secondary)]">{doDia(pedido.dia)}</span>}
      </div>
      <p className="text-sm text-[var(--text-secondary)] break-words">{resumoDosItens(pedido)}</p>
      <p className="text-sm tabular-nums text-[var(--text-secondary)]">
        {pedido.conta_id ? 'Pago na conta da mesa' : `Pago${forma ? ` em ${forma}` : ''}`}: {formatarMoeda(totalDoPedido(pedido))}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Botao cor={VERDE} onClick={entregue} disabled={salvando}>
          <CheckIcon className="w-5 h-5" />
          Já foi entregue
        </Botao>
        <CancelarPedido pedidoId={pedido.id} pago={Boolean(pedido.pago_em) && !pedido.conta_id} onErro={onErro} />
      </div>
    </li>
  );
}

// Conta sem receber: a mesa inteira ou um pedido do balcão.
function CartaoConta({ conta, mostrarDia, onErro, onReceberMesa }) {
  const [passo, setPasso] = useState(null); // null | 'receber' | 'naoRecebido' | 'cancelar'
  const [salvando, setSalvando] = useState(false);
  const ids = conta.pedidos.map((p) => p.id);
  const daMesa = Boolean(conta.mesa);
  const titulo = daMesa ? rotuloDaMesa(conta) : `Pedido ${numeroDoPedido(conta.pedidos[0])}`;

  async function fazer(acao) {
    setSalvando(true);
    onErro('');
    try {
      await acao();
    } catch (e) {
      onErro(e.message);
      setSalvando(false);
      setPasso(null);
    }
  }

  function receber() {
    if (daMesa) onReceberMesa(conta);
    else setPasso('receber');
  }

  return (
    <li className={classeCartao}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xl font-extrabold text-[var(--text-primary)] break-words min-w-0">{titulo}</span>
        {!daMesa && conta.pedidos[0].identificacao && (
          <span className="font-bold text-[var(--text-primary)] break-words">{conta.pedidos[0].identificacao}</span>
        )}
        {mostrarDia && <span className="text-sm tabular-nums text-[var(--text-secondary)]">{doDia(conta.dia)}</span>}
        <span className="ml-auto text-lg font-bold tabular-nums text-[var(--text-primary)]">{formatarMoeda(conta.total)}</span>
      </div>
      <p className="text-sm text-[var(--text-secondary)] break-words">
        {daMesa ? `${quantosPedidos(conta.pedidos.length)} sem receber: ` : 'Sem receber: '}
        {conta.pedidos.map(resumoDosItens).join(' · ')}
      </p>

      {passo === null && (
        <div className="flex flex-wrap items-center gap-2">
          <Botao cor={VERDE} onClick={receber} disabled={salvando}>
            Receber agora
          </Botao>
          <Botao variante="secundaria" onClick={() => setPasso('naoRecebido')} disabled={salvando}>
            Foi embora sem pagar
          </Botao>
          <button
            type="button"
            onClick={() => setPasso('cancelar')}
            disabled={salvando}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold border border-[var(--border-subtle)] text-[var(--texto-cozinha)] hover:bg-[var(--surface-card-hover)]"
          >
            Cancelar a conta
          </button>
        </div>
      )}

      {passo === 'receber' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Como o ${titulo.toLowerCase()} foi pago?`}>
            {FORMAS_DE_PAGAMENTO.map((f) => (
              <Botao
                key={f.id}
                variante="secundaria"
                disabled={salvando}
                onClick={() =>
                  fazer(async () => {
                    const quantos = await registrarPagamento(ids, f.id);
                    if (quantos === 0) throw new Error(`O ${titulo.toLowerCase()} já tinha sido recebido em outro aparelho ou foi cancelado.`);
                  })
                }
              >
                {f.rotulo}
              </Botao>
            ))}
          </div>
          <button type="button" onClick={() => setPasso(null)} disabled={salvando} className={classeVoltar}>
            Voltar
          </button>
        </div>
      )}

      {passo === 'naoRecebido' && (
        <div className="flex flex-col gap-2" role="group" aria-label="Confirmar que foi embora sem pagar">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            O cliente foi embora sem pagar {formatarMoeda(conta.total)}?
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Fica no Caixa e nos relatórios como não recebido. Se ele voltar para pagar, dá para desfazer no Caixa.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={salvando}
              className={classeOpcao}
              style={{ backgroundColor: LARANJA }}
              onClick={() => fazer(() => marcarNaoRecebido(ids))}
            >
              Sim, foi embora sem pagar
            </button>
          </div>
          <button type="button" onClick={() => setPasso(null)} disabled={salvando} className={classeVoltar}>
            Voltar
          </button>
        </div>
      )}

      {passo === 'cancelar' && (
        <div className="flex flex-col gap-2" role="group" aria-label="Motivo do cancelamento da conta">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Cancelar {daMesa ? `os ${quantosPedidos(conta.pedidos.length)} da conta` : 'o pedido'}? Por quê?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MOTIVOS_CANCELAMENTO.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={salvando}
                className={classeOpcao}
                style={{ backgroundColor: VERMELHO }}
                onClick={() => fazer(() => cancelarConta(ids, m.id))}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPasso(null)} disabled={salvando} className={classeVoltar}>
            Voltar, não cancelar
          </button>
        </div>
      )}
    </li>
  );
}

// O que impede encerrar o dia, com um jeito de resolver cada coisa.
// pedidos: com valores (do dia, ou pendências de dias anteriores).
// mostrarDia: mostra de que dia é cada pedido (pendências de dias anteriores).
export default function ResolverPendencias({ pedidos, taxa = 0, titulo, descricao, idTitulo, mostrarDia = false }) {
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [receberMesa, setReceberMesa] = useState(null);
  const [salvandoTodos, setSalvandoTodos] = useState(false);
  const { contas, aEntregar } = pendenciasDoDia(pedidos);
  const prontos = aEntregar.filter((p) => p.status === 'pronto');
  // A conta aberta na janela some se for recebida em outro aparelho.
  const contaNaJanela = receberMesa && contas.find((c) => c.chave === receberMesa);

  async function todosEntregues() {
    setSalvandoTodos(true);
    setErro('');
    try {
      await marcarEntregues(prontos.map((p) => p.id));
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvandoTodos(false);
    }
  }

  if (!contas.length && !aEntregar.length) {
    return aviso ? (
      <div aria-live="polite" className="mb-6">
        <Aviso tipo="sucesso">{aviso}</Aviso>
      </div>
    ) : null;
  }

  return (
    <section aria-labelledby={idTitulo} className="mb-8 rounded-2xl border-2 p-4 sm:p-5 flex flex-col gap-4" style={{ borderColor: LARANJA }}>
      <div className="flex items-start gap-3">
        <AlertIcon className="w-6 h-6 shrink-0 text-[var(--texto-laranja)]" />
        <div className="min-w-0">
          <h2 id={idTitulo} className="text-lg font-bold text-[var(--text-primary)] break-words">
            {titulo}
          </h2>
          {descricao && <p className="text-sm text-[var(--text-secondary)]">{descricao}</p>}
        </div>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {erro && <Aviso>{erro}</Aviso>}
        {aviso && <Aviso tipo="sucesso">{aviso}</Aviso>}
      </div>

      {contas.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold text-[var(--text-primary)]">
            Sem receber ({contas.length === 1 ? '1 conta' : `${contas.length} contas`})
          </h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {contas.map((c) => (
              <CartaoConta key={c.chave} conta={c} mostrarDia={mostrarDia} onErro={setErro} onReceberMesa={(conta) => setReceberMesa(conta.chave)} />
            ))}
          </ul>
        </div>
      )}

      {aEntregar.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-[var(--text-primary)]">Sem marcar como entregue ({aEntregar.length})</h3>
            {prontos.length > 1 && (
              <Botao variante="secundaria" onClick={todosEntregues} disabled={salvandoTodos}>
                <CheckIcon className="w-5 h-5" />
                Os {prontos.length} prontos já foram entregues
              </Botao>
            )}
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {aEntregar.map((p) => (
              <CartaoAEntregar key={p.id} pedido={p} mostrarDia={mostrarDia} onErro={setErro} />
            ))}
          </ul>
        </div>
      )}

      {contaNaJanela && (
        <Janela titulo={`Fechar a ${rotuloDaMesa(contaNaJanela)}`} idTitulo="titulo-receber-pendencia" onFechar={() => setReceberMesa(null)}>
          <FecharMesa
            mesa={contaNaJanela}
            taxa={taxa}
            onFechada={(texto) => {
              setReceberMesa(null);
              setAviso(texto);
            }}
            onVoltar={() => setReceberMesa(null)}
          />
        </Janela>
      )}
    </section>
  );
}
