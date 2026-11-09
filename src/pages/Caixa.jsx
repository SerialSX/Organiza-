import { useState } from 'react';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Abas from '../components/ui/Abas';
import Botao from '../components/ui/Botao';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import { MoneyIcon } from '../components/icons/AppIcons';
import { usePedidosDoDia } from '../hooks/usePedidosDoDia';
import { useAbaNoEndereco } from '../hooks/useAbaNoEndereco';
import { registrarPagamento, FORMAS_DE_PAGAMENTO, ROTULO_FORMA } from '../services/pedidos';
import { desfazerContaMesa } from '../services/mesas';
import { desfazerNaoRecebido } from '../services/fimDoDia';
import ADevolver from '../components/fimDoDia/ADevolver';
import { usePendenciasAnteriores } from '../hooks/usePendenciasAnteriores';
import { aDevolver } from '../lib/fimDoDia';
import EncerrarDia from '../components/fimDoDia/EncerrarDia';
import { nomeDaMesa } from '../lib/mesas';
import { fecharCaixa, totalDoPedido } from '../lib/caixa';
import { destinoDoPedido, formatarHora, formatarMoeda, hojeNoNegocio, numeroDoPedido } from '../lib/formatadores';

const ACCENT = 'var(--color-accent-relatorios)';
const DIAS = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'ontem', rotulo: 'Ontem' },
];
const dataLonga = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

function diaEscolhido(aba) {
  const hoje = hojeNoNegocio();
  if (aba !== 'ontem') return hoje;
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function Pendente({ pedido, onErro }) {
  const [salvando, setSalvando] = useState(false);

  async function receber(forma) {
    setSalvando(true);
    onErro('');
    try {
      const quantos = await registrarPagamento([pedido.id], forma);
      if (quantos === 0) onErro(`O pedido ${numeroDoPedido(pedido)} já tinha sido recebido em outro aparelho ou foi cancelado.`);
    } catch (e) {
      onErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{numeroDoPedido(pedido)}</span>
        {pedido.identificacao && <span className="font-bold text-[var(--text-primary)] break-words">{pedido.identificacao}</span>}
        <span className="text-sm tabular-nums text-[var(--text-secondary)]">{formatarHora(pedido.criado_em)}</span>
        <span className="ml-auto text-lg font-bold tabular-nums text-[var(--text-primary)]">{formatarMoeda(totalDoPedido(pedido))}</span>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Receber o pedido ${numeroDoPedido(pedido)}`}>
        {FORMAS_DE_PAGAMENTO.map((f) => (
          <Botao key={f.id} variante="secundaria" onClick={() => receber(f.id)} disabled={salvando}>
            {f.rotulo}
          </Botao>
        ))}
      </div>
    </li>
  );
}

// Recebido por engano (forma errada, cliente errado): volta para "A receber"
// e dá para registrar de novo.
function Recebido({ pedido, onErro }) {
  const [salvando, setSalvando] = useState(false);
  const forma = ROTULO_FORMA[pedido.forma_pagamento] ?? pedido.forma_pagamento;

  async function desfazer() {
    setSalvando(true);
    onErro('');
    try {
      await registrarPagamento([pedido.id], null);
    } catch (e) {
      onErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="font-bold tabular-nums text-[var(--text-primary)]">{numeroDoPedido(pedido)}</span>
      {pedido.identificacao && <span className="font-medium text-[var(--text-primary)] break-words">{pedido.identificacao}</span>}
      <span className="text-sm tabular-nums text-[var(--text-secondary)]">
        {forma} às {formatarHora(pedido.pago_em)}
      </span>
      <span className="ml-auto font-semibold tabular-nums text-[var(--text-primary)]">{formatarMoeda(totalDoPedido(pedido))}</span>
      <Botao variante="texto" onClick={desfazer} disabled={salvando} aria-label={`Desfazer o recebimento do pedido ${numeroDoPedido(pedido)}`}>
        Desfazer
      </Botao>
    </li>
  );
}

const JEITO = { um_pagou: 'Um pagou tudo', dividiram: 'Dividiram', separado: 'Pagaram separado, sem detalhe' };

function vezes(n) {
  return n === 1 ? '1 recebimento' : `${n} recebimentos`;
}

// Conta de mesa recebida errado (forma, valor, mesa): desfaz e a mesa volta a
// ficar aberta em Pedidos, para fechar de novo.
function ContaRecebida({ conta, onErro }) {
  const [salvando, setSalvando] = useState(false);
  const formas = [...new Set(conta.pagamentos.map((p) => ROTULO_FORMA[p.forma] ?? p.forma))].join(', ');

  async function desfazer() {
    setSalvando(true);
    onErro('');
    try {
      await desfazerContaMesa(conta.id);
    } catch (e) {
      onErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="font-bold text-[var(--text-primary)] break-words">Conta da {nomeDaMesa(conta)}</span>
      <span className="text-sm tabular-nums text-[var(--text-secondary)]">
        {JEITO[conta.jeito]}
        {formas ? ` (${formas})` : ''} às {formatarHora(conta.criado_em)}
        {conta.servico > 0 ? ` · serviço ${formatarMoeda(conta.servico)}` : ''}
      </span>
      <span className="ml-auto font-semibold tabular-nums text-[var(--text-primary)]">{formatarMoeda(conta.consumo + conta.servico)}</span>
      <Botao variante="texto" onClick={desfazer} disabled={salvando} aria-label={`Desfazer o recebimento da conta da ${nomeDaMesa(conta)}`}>
        Desfazer
      </Botao>
    </li>
  );
}

// Pedido pago e cancelado: o dinheiro ainda vai voltar para o cliente.
// Foram embora sem pagar: a mesa inteira (ou o pedido do balcão) junta.
function agruparNaoRecebidos(pedidos) {
  const grupos = new Map();
  for (const p of pedidos) {
    const chave = p.mesa ? `mesa:${p.mesa}` : p.id;
    const grupo = grupos.get(chave) ?? { chave, pedidos: [], total: 0 };
    grupo.pedidos.push(p);
    grupo.total += totalDoPedido(p);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()];
}

function NaoRecebido({ grupo, onErro }) {
  const [salvando, setSalvando] = useState(false);
  const primeiro = grupo.pedidos[0];
  const nome = primeiro.mesa ? destinoDoPedido(primeiro) : `Pedido ${numeroDoPedido(primeiro)}`;

  async function desfazer() {
    setSalvando(true);
    onErro('');
    try {
      await desfazerNaoRecebido(grupo.pedidos.map((p) => p.id));
    } catch (e) {
      onErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="font-bold text-[var(--text-primary)] break-words">{nome}</span>
      <span className="text-sm tabular-nums text-[var(--text-secondary)]">
        {grupo.pedidos.length === 1 ? '1 pedido' : `${grupo.pedidos.length} pedidos`}, marcado às {formatarHora(primeiro.nao_recebido_em)}
      </span>
      <span className="ml-auto font-semibold tabular-nums text-[var(--text-primary)]">{formatarMoeda(grupo.total)}</span>
      <Botao variante="texto" onClick={desfazer} disabled={salvando} aria-label={`Desfazer: ${nome} não foi embora sem pagar`}>
        Desfazer
      </Botao>
    </li>
  );
}

// Fechamento do caixa: quanto entrou em Pix, dinheiro, crédito e débito, o que ainda
// falta receber, o que não foi recebido e o que foi cancelado depois de pago (a devolver).
export default function Caixa() {
  const [aba, setAba] = useAbaNoEndereco('dia', DIAS, 'hoje');
  const dia = diaEscolhido(aba);
  const { pedidos, contas, encerramento, carregando, erro: erroCarga, recarregar } = usePedidosDoDia(dia);
  const [erro, setErro] = useState('');
  const { pedidos: anteriores } = usePendenciasAnteriores();
  const devolucoesAnteriores = anteriores.filter(aDevolver);
  const caixa = fecharCaixa(pedidos, contas);
  const recebimentos = caixa.recebidos.length + caixa.contas.length;
  const titulo = dataLonga.format(new Date(`${dia}T12:00:00Z`));
  // "Cartão" só aparece em dia com pedido pago antes de separar crédito e débito.
  const formasNoCaixa = [...FORMAS_DE_PAGAMENTO.map((f) => f.id), ...(caixa.quantidadePorForma.cartao ? ['cartao'] : [])];

  return (
    <AppShell largura="max-w-4xl">
      <PageHeader icon={MoneyIcon} accent={ACCENT} title="Caixa" subtitle={`Fechamento de ${titulo}`} />

      <div className="mb-6">
        <Abas opcoes={DIAS} valor={aba} onMudar={setAba} cor={ACCENT} rotulo="Dia" />
      </div>

      {(erro || erroCarga) && <Aviso className="mb-4">{erro || erroCarga}</Aviso>}

      {!carregando && (aba !== 'ontem' || pedidos.length > 0) && (
        <div className="mb-6">
          <EncerrarDia key={dia} dia={dia} pedidos={pedidos} encerramento={encerramento} ehHoje={aba !== 'ontem'} onEncerrado={recarregar} />
        </div>
      )}

      {aba === 'hoje' && devolucoesAnteriores.length > 0 && (
        <section aria-labelledby="devolucoes-anteriores" className="mb-6">
          <h2 id="devolucoes-anteriores" className="text-lg font-bold">A devolver de dias anteriores</h2>
          <ul>{devolucoesAnteriores.map((p) => <ADevolver key={p.id} pedido={p} onErro={setErro} />)}</ul>
        </section>
      )}
      {carregando ? (
        <Carregando texto="Somando o caixa…" />
      ) : pedidos.length === 0 ? (
        <EstadoVazio icon={MoneyIcon} accent={ACCENT} titulo="Nenhum pedido neste dia" texto="O caixa aparece aqui assim que os pedidos forem lançados." />
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="titulo-recebido" className="rounded-2xl border-2 bg-[var(--surface-card)] p-5" style={{ borderColor: ACCENT }}>
            <h2 id="titulo-recebido" className="text-sm font-medium text-[var(--text-secondary)]">
              Recebido
            </h2>
            <p className="text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatarMoeda(caixa.recebido)}</p>
            <dl className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {formasNoCaixa.map((id) => (
                <div key={id} className="rounded-xl border border-[var(--border-subtle)] p-3 min-w-0">
                  <dt className="text-sm font-medium text-[var(--text-secondary)]">{ROTULO_FORMA[id]}</dt>
                  <dd className="text-xl sm:text-2xl font-bold tabular-nums text-[var(--text-primary)]">{formatarMoeda(caixa.porForma[id])}</dd>
                  <dd className="text-xs tabular-nums text-[var(--text-secondary)]">{vezes(caixa.quantidadePorForma[id])}</dd>
                </div>
              ))}
              {caixa.contasSeparadas > 0 && (
                <div className="col-span-2 lg:col-span-4 rounded-xl border border-[var(--border-subtle)] p-3 min-w-0">
                  <dt className="text-sm font-medium text-[var(--text-secondary)]">Pago separado, sem detalhe</dt>
                  <dd className="text-xl sm:text-2xl font-bold tabular-nums text-[var(--text-primary)]">{formatarMoeda(caixa.semDetalhe)}</dd>
                  <dd className="text-xs text-[var(--text-secondary)]">
                    {caixa.contasSeparadas === 1 ? '1 conta de mesa' : `${caixa.contasSeparadas} contas de mesa`} em que cada um pagou o seu,
                    sem anotar a forma
                  </dd>
                </div>
              )}
            </dl>
            {caixa.servico > 0 && (
              <p className="mt-4 text-sm tabular-nums text-[var(--text-primary)]">
                <strong>Taxa de serviço: {formatarMoeda(caixa.servico)}</strong>{' '}
                <span className="text-[var(--text-secondary)]">
                  (já está no recebido acima). É dos garçons: não entra no total vendido.
                </span>
              </p>
            )}
            {recebimentos > 0 && (
              <details className="mt-4 rounded-xl border border-[var(--border-subtle)] px-3 py-1">
                <summary className="min-h-11 flex items-center cursor-pointer text-sm font-semibold text-[var(--text-primary)]">
                  Ver os recebimentos ({recebimentos}) e desfazer um recebimento errado
                </summary>
                <ul className="divide-y divide-[var(--border-subtle)] pb-2">
                  {caixa.contas.map((c) => (
                    <ContaRecebida key={c.id} conta={c} onErro={setErro} />
                  ))}
                  {caixa.recebidos.map((p) => (
                    <Recebido key={p.id} pedido={p} onErro={setErro} />
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section aria-labelledby="titulo-a-receber">
            <div className="flex flex-wrap items-baseline gap-3 mb-3">
              <h2 id="titulo-a-receber" className="text-lg font-semibold text-[var(--text-primary)]">
                A receber
              </h2>
              <span className="text-lg font-bold tabular-nums text-[var(--texto-laranja)]">{formatarMoeda(caixa.aReceber)}</span>
            </div>
            {caixa.pendentes.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">Tudo recebido. O caixa fechou certinho.</p>
            ) : (
              <>
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  Pedidos sem forma de pagamento registrada. Toque em como o cliente pagou.
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {caixa.pendentes.map((p) => (
                    <Pendente key={p.id} pedido={p} onErro={setErro} />
                  ))}
                </ul>
              </>
            )}
          </section>

          {caixa.aDevolver.length > 0 && (
            <section aria-labelledby="titulo-a-devolver">
              <div className="flex flex-wrap items-baseline gap-3 mb-1">
                <h2 id="titulo-a-devolver" className="text-lg font-semibold text-[var(--text-primary)]">
                  A devolver
                </h2>
                <span className="text-lg font-bold tabular-nums text-[var(--texto-cozinha)]">{formatarMoeda(caixa.devolver)}</span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                Pedidos pagos e depois cancelados. O dinheiro ainda está com você e fica fora do total. Toque em “Devolvi” quando
                entregar ao cliente.
              </p>
              <ul className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4">
                {caixa.aDevolver.map((p) => (
                  <ADevolver key={p.id} pedido={p} onErro={setErro} />
                ))}
              </ul>
            </section>
          )}

          {caixa.naoRecebidos.length > 0 && (
            <section aria-labelledby="titulo-nao-recebido">
              <div className="flex flex-wrap items-baseline gap-3 mb-1">
                <h2 id="titulo-nao-recebido" className="text-lg font-semibold text-[var(--text-primary)]">
                  Não recebido
                </h2>
                <span className="text-lg font-bold tabular-nums text-[var(--texto-cozinha)]">{formatarMoeda(caixa.naoRecebido)}</span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                Foram embora sem pagar. Fica fora do total vendido e aparece nos relatórios. O cliente voltou para pagar? Toque em
                “Desfazer” e receba a conta.
              </p>
              <ul className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4">
                {agruparNaoRecebidos(caixa.naoRecebidos).map((g) => (
                  <NaoRecebido key={g.chave} grupo={g} onErro={setErro} />
                ))}
              </ul>
            </section>
          )}

          <p className="text-sm tabular-nums text-[var(--text-secondary)]">
            Total vendido no dia (recebido + a receber{caixa.servico > 0 ? ', sem a taxa de serviço' : ''}): {formatarMoeda(caixa.vendido)}
          </p>
        </div>
      )}
    </AppShell>
  );
}
