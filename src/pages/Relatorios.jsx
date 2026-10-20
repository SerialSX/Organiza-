import { useEffect, useState } from 'react';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Abas from '../components/ui/Abas';
import Botao from '../components/ui/Botao';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import { ReportsIcon, MoneyIcon, OrdersIcon, TrendIcon, TrophyIcon, BoxIcon, DownloadIcon } from '../components/icons/AppIcons';
import { useProdutos } from '../hooks/useProdutos';
import { useAbaNoEndereco } from '../hooks/useAbaNoEndereco';
import { listarPedidosDoPeriodo } from '../services/pedidos';
import { calcularRelatorio, faturamentoPorDia, intervaloDoPeriodo, rankingParaCsv } from '../services/relatorios';
import { formatarMoeda } from '../lib/formatadores';
import { rotuloDoMotivo } from '../lib/pedidoStatus';
import { corDeTexto } from '../lib/cores';

const ACCENT = 'var(--color-accent-relatorios)';

const PERIODOS = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'semana', rotulo: '7 dias' },
  { id: 'mes', rotulo: '30 dias' },
];

const diaCurto = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

function plural(n, singular, varios) {
  return `${n} ${n === 1 ? singular : varios}`;
}

function Indicador({ icon: Icon, cor, rotulo, valor, detalhe }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:p-5 flex flex-col gap-2 min-w-0">
      <span
        className="inline-flex items-center justify-center w-10 h-10 rounded-xl"
        style={{ backgroundColor: `color-mix(in srgb, ${cor} 18%, transparent)`, color: corDeTexto(cor) }}
      >
        <Icon className="w-5 h-5" />
      </span>
      <p className="text-sm font-medium text-[var(--text-secondary)]">{rotulo}</p>
      <p className="text-2xl sm:text-3xl font-extrabold tabular-nums text-[var(--text-primary)] break-words">{valor}</p>
      {detalhe && <p className="text-xs text-[var(--text-secondary)]">{detalhe}</p>}
    </div>
  );
}

function Destaque({ icon: Icon, cor, titulo, produto, valor, vazio }) {
  return (
    <div className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 flex items-center gap-4 min-w-0" style={{ borderColor: cor }}>
      <span
        className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-[var(--sobre-destaque)] shrink-0"
        style={{ backgroundColor: cor }}
      >
        <Icon className="w-7 h-7" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-secondary)]">{titulo}</p>
        {produto ? (
          <>
            <p className="text-xl font-bold text-[var(--text-primary)] break-words">{produto.nome}</p>
            <p className="text-sm font-semibold tabular-nums" style={{ color: corDeTexto(cor) }}>
              {valor}
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--text-secondary)] mt-1">{vazio}</p>
        )}
      </div>
    </div>
  );
}

function GraficoFaturamento({ dias }) {
  const maior = Math.max(...dias.map((d) => d.valor), 1);
  const mostrarTodosRotulos = dias.length <= 7;
  const melhor = dias.reduce((a, b) => (b.valor > a.valor ? b : a), dias[0]);

  return (
    <section aria-labelledby="titulo-grafico" className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
      <h2 id="titulo-grafico" className="text-lg font-semibold text-[var(--text-primary)]">
        Faturamento por dia
      </h2>
      {melhor.valor > 0 && (
        <p className="text-sm tabular-nums text-[var(--text-secondary)] mt-1">
          Melhor dia: {diaCurto.format(melhor.data)}, com {formatarMoeda(melhor.valor)}
        </p>
      )}
      <div className="flex items-end gap-1 sm:gap-2 h-44 mt-4" aria-hidden="true">
        {dias.map(({ data, valor }, i) => (
          <div key={data.toISOString()} className="flex-1 h-full flex flex-col justify-end items-center gap-1 min-w-0">
            <div
              className="w-full rounded-t-md"
              style={{
                height: `${Math.max((valor / maior) * 100, valor ? 4 : 1)}%`,
                backgroundColor: valor ? ACCENT : 'var(--border-subtle)',
              }}
              title={`${diaCurto.format(data)}: ${formatarMoeda(valor)}`}
            />
            <span className="text-[10px] tabular-nums text-[var(--text-secondary)] h-3">
              {mostrarTodosRotulos || i % 5 === 0 || i === dias.length - 1 ? diaCurto.format(data) : ''}
            </span>
          </div>
        ))}
      </div>
      {/* O gráfico é só visual; os mesmos números ficam aqui para leitor de tela. */}
      <table className="sr-only">
        <caption>Faturamento por dia</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Faturamento</th>
          </tr>
        </thead>
        <tbody>
          {dias.map(({ data, valor }) => (
            <tr key={data.toISOString()}>
              <td>{diaCurto.format(data)}</td>
              <td>{formatarMoeda(valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Ranking({ ranking }) {
  const maior = ranking[0]?.quantidade ?? 1;

  return (
    <section aria-labelledby="titulo-ranking" className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
      <div className="flex items-center gap-3 mb-1">
        <BoxIcon className="w-6 h-6 text-[var(--texto-laranja)]" />
        <h2 id="titulo-ranking" className="text-lg font-semibold text-[var(--text-primary)]">
          Aviso de reposição
        </h2>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-5">
        Os produtos que mais saíram no período. Confira o estoque dos primeiros da lista.
      </p>
      <ol className="flex flex-col gap-4">
        {ranking.map((p, i) => (
          <li key={p.produto_id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold tabular-nums text-[var(--text-secondary)] w-7">{i + 1}º</span>
              <span className="flex-1 min-w-0 font-semibold text-[var(--text-primary)] break-words">{p.nome}</span>
              <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">{plural(p.quantidade, 'unidade', 'unidades')}</span>
            </div>
            <div className="ml-9 h-2.5 rounded-full bg-[var(--border-subtle)] overflow-hidden" aria-hidden="true">
              <div
                className="h-full rounded-full"
                style={{ width: `${(p.quantidade / maior) * 100}%`, backgroundColor: i < 3 ? 'var(--color-brand-orange)' : ACCENT }}
              />
            </div>
            <p className="ml-9 text-xs tabular-nums text-[var(--text-secondary)]">
              {formatarMoeda(p.faturamento)} vendidos
              {p.lucro !== null && `, ${formatarMoeda(p.lucro)} de lucro`}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function baixarCsv(ranking, periodo) {
  // O BOM faz o Excel reconhecer UTF-8 e mostrar os acentos certos.
  const BOM = String.fromCharCode(0xfeff);
  const arquivo = new Blob([BOM, rankingParaCsv(ranking)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  const hoje = new Date().toLocaleDateString('sv-SE');
  link.href = url;
  link.download = `organiza-relatorio-${periodo}-${hoje}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function textoCancelados(relatorio) {
  if (!relatorio.totalCancelados) return null;
  const motivos = Object.entries(relatorio.canceladosPorMotivo)
    .map(([motivo, n]) => `${rotuloDoMotivo(motivo)}: ${n}`)
    .join(', ');
  return `Fora da conta: ${plural(relatorio.totalCancelados, 'cancelado', 'cancelados')} (${motivos}).`;
}

export default function Relatorios() {
  const { produtos } = useProdutos();
  const [periodo, setPeriodo] = useAbaNoEndereco('periodo', PERIODOS, 'hoje');
  const [dados, setDados] = useState({ periodo: null, pedidos: [], erro: '' });

  useEffect(() => {
    let ativo = true;
    const { inicio, fim } = intervaloDoPeriodo(periodo);
    listarPedidosDoPeriodo(inicio, fim)
      .then((pedidos) => ativo && setDados({ periodo, pedidos, erro: '' }))
      .catch((e) => ativo && setDados({ periodo, pedidos: [], erro: e.message }));
    return () => {
      ativo = false;
    };
  }, [periodo]);

  const carregando = dados.periodo !== periodo;
  const relatorio = calcularRelatorio(dados.pedidos, produtos);
  const { inicio, fim } = intervaloDoPeriodo(periodo);

  return (
    <AppShell largura="max-w-6xl">
      <PageHeader icon={ReportsIcon} accent={ACCENT} title="Relatórios" subtitle="O que aconteceu nas suas vendas" />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Abas opcoes={PERIODOS} valor={periodo} onMudar={setPeriodo} cor={ACCENT} rotulo="Período" />
        {!carregando && relatorio.ranking.length > 0 && (
          <Botao variante="secundaria" className="ml-auto" onClick={() => baixarCsv(relatorio.ranking, periodo)}>
            <DownloadIcon className="w-5 h-5" />
            Baixar planilha
          </Botao>
        )}
      </div>

      {dados.erro && <Aviso className="mb-4">{dados.erro}</Aviso>}

      {carregando ? (
        <Carregando texto="Calculando…" />
      ) : relatorio.totalPedidos + relatorio.totalCancelados === 0 ? (
        <EstadoVazio
          icon={ReportsIcon}
          accent={ACCENT}
          titulo="Nenhuma venda no período"
          texto="Os relatórios aparecem assim que os pedidos forem lançados."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Indicador icon={MoneyIcon} cor={ACCENT} rotulo="Faturamento" valor={formatarMoeda(relatorio.faturamento)} />
            <Indicador
              icon={OrdersIcon}
              cor="var(--color-accent-pedidos)"
              rotulo="Pedidos"
              valor={relatorio.totalPedidos}
              detalhe={textoCancelados(relatorio)}
            />
            <Indicador icon={TrendIcon} cor="var(--color-brand-orange)" rotulo="Ticket médio" valor={formatarMoeda(relatorio.ticketMedio)} />
            <Indicador
              icon={TrophyIcon}
              cor={ACCENT}
              rotulo="Lucro estimado"
              valor={formatarMoeda(relatorio.lucroEstimado)}
              detalhe={
                relatorio.produtosSemCusto
                  ? `${plural(relatorio.produtosSemCusto, 'produto sem custo cadastrado ficou', 'produtos sem custo cadastrado ficaram')} de fora.`
                  : null
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Destaque
              icon={TrophyIcon}
              cor="var(--color-brand-orange)"
              titulo="Mais vendido"
              produto={relatorio.maisVendido}
              valor={relatorio.maisVendido && plural(relatorio.maisVendido.quantidade, 'unidade', 'unidades')}
            />
            <Destaque
              icon={MoneyIcon}
              cor={ACCENT}
              titulo="Mais lucrativo"
              produto={relatorio.maisLucrativo}
              valor={relatorio.maisLucrativo && `${formatarMoeda(relatorio.maisLucrativo.lucro)} de lucro`}
              vazio="Cadastre o custo dos produtos para ver qual dá mais lucro."
            />
          </div>

          {periodo !== 'hoje' && <GraficoFaturamento dias={faturamentoPorDia(dados.pedidos, inicio, fim)} />}

          <Ranking ranking={relatorio.ranking} />
        </div>
      )}
    </AppShell>
  );
}
