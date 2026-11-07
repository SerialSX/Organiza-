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
import { registrarPagamento, FORMAS_DE_PAGAMENTO } from '../services/pedidos';
import { fecharCaixa, totalDoPedido } from '../lib/caixa';
import { formatarHora, formatarMoeda, hojeNoNegocio, numeroDoPedido } from '../lib/formatadores';

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
    try {
      await registrarPagamento([pedido.id], forma);
    } catch (e) {
      onErro(e.message);
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

// Fechamento do caixa: quanto entrou em Pix, dinheiro e cartão, o que ainda
// falta receber e o que foi cancelado depois de pago (a devolver).
export default function Caixa() {
  const [aba, setAba] = useAbaNoEndereco('dia', DIAS, 'hoje');
  const dia = diaEscolhido(aba);
  const { pedidos, carregando, erro: erroCarga } = usePedidosDoDia(dia);
  const [erro, setErro] = useState('');
  const caixa = fecharCaixa(pedidos);
  const titulo = dataLonga.format(new Date(`${dia}T12:00:00Z`));

  return (
    <AppShell largura="max-w-4xl">
      <PageHeader icon={MoneyIcon} accent={ACCENT} title="Caixa" subtitle={`Fechamento de ${titulo}`} />

      <div className="mb-6">
        <Abas opcoes={DIAS} valor={aba} onMudar={setAba} cor={ACCENT} rotulo="Dia" />
      </div>

      {(erro || erroCarga) && <Aviso className="mb-4">{erro || erroCarga}</Aviso>}

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
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {FORMAS_DE_PAGAMENTO.map((f) => (
                <div key={f.id} className="rounded-xl border border-[var(--border-subtle)] p-3">
                  <dt className="text-sm font-medium text-[var(--text-secondary)]">{f.rotulo}</dt>
                  <dd className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{formatarMoeda(caixa.porForma[f.id])}</dd>
                  <dd className="text-xs tabular-nums text-[var(--text-secondary)]">
                    {caixa.quantidadePorForma[f.id] === 1 ? '1 pedido' : `${caixa.quantidadePorForma[f.id]} pedidos`}
                  </dd>
                </div>
              ))}
            </dl>
            {caixa.devolver > 0 && (
              <p className="mt-4 text-sm font-semibold text-[var(--texto-cozinha)]">
                Cancelados depois de pagos: {formatarMoeda(caixa.devolver)} a devolver ao cliente (fora do total).
              </p>
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

          <p className="text-sm tabular-nums text-[var(--text-secondary)]">
            Total vendido no dia (recebido + a receber): {formatarMoeda(caixa.vendido)}
          </p>
        </div>
      )}
    </AppShell>
  );
}
