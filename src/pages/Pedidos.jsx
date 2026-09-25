import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import { OrdersIcon, ProductsIcon, PlusIcon, MinusIcon, SendIcon, CheckIcon } from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';
import { useProdutos } from '../hooks/useProdutos';
import { usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { criarPedido, atualizarStatusPedido } from '../services/pedidos';
import { formatarMoeda, codigoPedido } from '../lib/formatadores';
import { STATUS } from '../lib/pedidoStatus';

const ACCENT = 'var(--color-accent-pedidos)';

function BotaoQuantidade({ onClick, rotulo, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      className="w-10 h-10 inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)]"
    >
      {children}
    </button>
  );
}

function PedidosEmAndamento({ pedidos, onErro }) {
  const prontos = pedidos.filter((p) => p.status === 'pronto');
  const preparando = pedidos.filter((p) => p.status !== 'pronto');

  if (!pedidos.length) return null;

  async function entregar(id) {
    try {
      await atualizarStatusPedido(id, 'entregue');
    } catch (e) {
      onErro(e.message);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Pedidos em andamento</h2>

      {prontos.length > 0 && (
        <ul className="flex flex-col gap-3 mb-4">
          {prontos.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-2xl border-2 p-4 bg-[var(--surface-card)]"
              style={{ borderColor: STATUS.pronto.cor }}
            >
              <span
                className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-white shrink-0"
                style={{ backgroundColor: STATUS.pronto.cor }}
              >
                <CheckIcon className="w-6 h-6" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[var(--text-primary)]">
                  {codigoPedido(p.id)} está pronto
                </p>
                <p className="text-sm text-[var(--text-secondary)] truncate">
                  {p.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => entregar(p.id)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white shrink-0"
                style={{ backgroundColor: STATUS.pronto.cor }}
              >
                Entregue
              </button>
            </li>
          ))}
        </ul>
      )}

      {preparando.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {preparando.map((p) => (
            <li
              key={p.id}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-sm"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS[p.status].cor }} />
              <span className="font-semibold text-[var(--text-primary)]">{codigoPedido(p.id)}</span>
              <span className="text-[var(--text-secondary)]">{STATUS[p.status].rotulo}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Pedidos() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const { produtos, carregando, erro: erroCarga } = useProdutos();
  const { pedidos: abertos } = usePedidosAbertos();
  // { [produtoId]: quantidade }
  const [carrinho, setCarrinho] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(null);

  const porId = Object.fromEntries(produtos.map((p) => [p.id, p]));
  // Produto que esgotou (ou foi excluído) enquanto estava no carrinho sai da conta.
  const itens = Object.entries(carrinho)
    .filter(([id, qtd]) => qtd > 0 && porId[id]?.disponivel)
    .map(([id, quantidade]) => ({ produto: porId[id], quantidade }));
  const esgotadosNoCarrinho = Object.keys(carrinho).filter((id) => porId[id] && !porId[id].disponivel);
  const totalItens = itens.reduce((s, i) => s + i.quantidade, 0);
  const total = itens.reduce((s, i) => s + i.quantidade * i.produto.preco, 0);

  function mudarQuantidade(id, delta) {
    setEnviado(null);
    setCarrinho((c) => {
      const nova = (c[id] ?? 0) + delta;
      const proximo = { ...c };
      if (nova > 0) proximo[id] = nova;
      else delete proximo[id];
      return proximo;
    });
  }

  async function enviar() {
    if (!itens.length || enviando) return;
    setErro('');
    setEnviando(true);
    try {
      const pedido = await criarPedido({
        negocioId: perfil.negocio_id,
        usuarioId: perfil.id,
        itens: itens.map(({ produto, quantidade }) => ({
          produto_id: produto.id,
          quantidade,
          preco_unitario: produto.preco,
        })),
      });
      setCarrinho({});
      setEnviado(pedido);
      setTimeout(() => setEnviado((atual) => (atual?.id === pedido.id ? null : atual)), 5000);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <AppShell>
        <Carregando texto="Carregando cardápio..." />
      </AppShell>
    );
  }

  return (
    <AppShell largura="max-w-6xl">
      <PageHeader icon={OrdersIcon} accent={ACCENT} title="Novo pedido" subtitle="Toque nos produtos para adicionar" />

      {erroCarga && <Aviso className="mb-4">{erroCarga}</Aviso>}

      {produtos.length === 0 ? (
        <EstadoVazio
          icon={ProductsIcon}
          accent="var(--color-accent-produtos)"
          titulo="Cadastre seus produtos primeiro"
          texto="Os pedidos são montados a partir dos produtos do seu cardápio."
        >
          <button
            type="button"
            onClick={() => navigate('/produtos')}
            className="mt-2 rounded-xl px-5 py-3 font-semibold text-white"
            style={{ backgroundColor: 'var(--color-accent-produtos)' }}
          >
            Ir para Produtos
          </button>
        </EstadoVazio>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {produtos.map((p) => {
              const qtd = carrinho[p.id] ?? 0;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!p.disponivel}
                    onClick={() => mudarQuantidade(p.id, 1)}
                    aria-label={p.disponivel ? `Adicionar ${p.nome}` : `${p.nome} esgotado`}
                    className="relative w-full h-full min-h-28 text-left rounded-2xl border-2 bg-[var(--surface-card)] p-4 flex flex-col justify-between gap-2 transition active:scale-[0.98] disabled:cursor-not-allowed"
                    style={{
                      borderColor: qtd ? ACCENT : 'var(--border-subtle)',
                      opacity: p.disponivel ? 1 : 0.45,
                    }}
                  >
                    <span className="font-semibold text-[var(--text-primary)] leading-tight break-words pr-8">
                      {p.nome}
                    </span>
                    <span className="text-lg font-bold" style={{ color: p.disponivel ? ACCENT : 'var(--text-secondary)' }}>
                      {p.disponivel ? formatarMoeda(p.preco) : 'Esgotado'}
                    </span>
                    {qtd > 0 && (
                      <span
                        className="absolute top-3 right-3 min-w-8 h-8 px-2 inline-flex items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ backgroundColor: ACCENT }}
                      >
                        {qtd}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <aside className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 lg:sticky lg:top-24 flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Pedido</h2>

            {enviado && (
              <Aviso tipo="sucesso">Pedido {codigoPedido(enviado.id)} enviado para a cozinha.</Aviso>
            )}
            {erro && <Aviso>{erro}</Aviso>}
            {esgotadosNoCarrinho.length > 0 && (
              <Aviso>
                {esgotadosNoCarrinho.map((id) => porId[id].nome).join(', ')} esgotou e saiu do pedido.
              </Aviso>
            )}

            {itens.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] py-4 text-center">Nenhum item ainda.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
                {itens.map(({ produto, quantidade }) => (
                  <li key={produto.id} className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--text-primary)] break-words">{produto.nome}</p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {formatarMoeda(produto.preco * quantidade)}
                      </p>
                    </div>
                    <BotaoQuantidade onClick={() => mudarQuantidade(produto.id, -1)} rotulo={`Tirar um ${produto.nome}`}>
                      <MinusIcon className="w-5 h-5" />
                    </BotaoQuantidade>
                    <span className="w-6 text-center font-bold text-[var(--text-primary)]">{quantidade}</span>
                    <BotaoQuantidade onClick={() => mudarQuantidade(produto.id, 1)} rotulo={`Mais um ${produto.nome}`}>
                      <PlusIcon className="w-5 h-5" />
                    </BotaoQuantidade>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-4">
              <span className="text-[var(--text-secondary)]">
                Total {totalItens > 0 && `(${totalItens} ${totalItens === 1 ? 'item' : 'itens'})`}
              </span>
              <span className="text-2xl font-bold text-[var(--text-primary)]">{formatarMoeda(total)}</span>
            </div>

            <button
              type="button"
              onClick={enviar}
              disabled={!itens.length || enviando}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-4 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: ACCENT }}
            >
              <SendIcon className="w-5 h-5" />
              {enviando ? 'Enviando...' : 'Enviar para a cozinha'}
            </button>

            {Object.keys(carrinho).length > 0 && (
              <button
                type="button"
                onClick={() => setCarrinho({})}
                className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Limpar pedido
              </button>
            )}
          </aside>
        </div>
      )}

      <PedidosEmAndamento pedidos={abertos} onErro={setErro} />

      {enviado && itens.length === 0 && (
        <div className="lg:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-10 px-4 pb-2">
          <div className="rounded-xl bg-[var(--surface-alt)] shadow-lg">
            <Aviso tipo="sucesso">Pedido {codigoPedido(enviado.id)} enviado para a cozinha.</Aviso>
          </div>
        </div>
      )}

      {/* Celular: total e envio sempre à mão, acima da barra de navegação */}
      {itens.length > 0 && (
        <>
          <div className="h-20 lg:hidden" aria-hidden="true" />
          <div className="lg:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-10 px-4 pb-2">
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-alt)] p-3 shadow-lg">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--text-secondary)]">
                  {totalItens} {totalItens === 1 ? 'item' : 'itens'}
                </p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{formatarMoeda(total)}</p>
              </div>
              <button
                type="button"
                onClick={enviar}
                disabled={enviando}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: ACCENT }}
              >
                <SendIcon className="w-5 h-5" />
                {enviando ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
