import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import CancelarPedido from '../components/CancelarPedido';
import {
  OrdersIcon,
  ProductsIcon,
  PlusIcon,
  MinusIcon,
  SendIcon,
  CheckIcon,
  PencilIcon,
  AlertIcon,
} from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';
import { useProdutos } from '../hooks/useProdutos';
import { usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { criarPedido, editarPedido, atualizarStatusPedido, buscarPedidoComValores } from '../services/pedidos';
import { formatarMoeda, numeroDoPedido } from '../lib/formatadores';
import { STATUS, podeEditar } from '../lib/pedidoStatus';
import { separarPedidos, itensQueFaltaram } from '../lib/fila';

const ACCENT = 'var(--color-accent-pedidos)';
const LIMITE_OBSERVACAO = 140;

let ultimaChave = 0;
function novaChave() {
  ultimaChave += 1;
  return ultimaChave;
}

function novaChaveEnvio() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

function LinhaDoPedido({ linha, onQuantidade, onObservacao }) {
  const { nome, quantidade, observacao, preco } = linha;
  const [editando, setEditando] = useState(false);
  const mostrarCampo = editando || observacao !== '';

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--text-primary)] break-words">{nome}</p>
          <p className="text-sm text-[var(--text-secondary)]">{formatarMoeda(preco * quantidade)}</p>
        </div>
        <BotaoQuantidade onClick={() => onQuantidade(-1)} rotulo={`Tirar um ${nome}`}>
          <MinusIcon className="w-5 h-5" />
        </BotaoQuantidade>
        <span className="w-6 text-center font-bold text-[var(--text-primary)]">{quantidade}</span>
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
          placeholder="Ex.: sem salada"
          aria-label={`Observação de ${nome}`}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-brand-orange)]"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <PencilIcon className="w-4 h-4" />
          Observação
        </button>
      )}
    </li>
  );
}

function resumoDosItens(pedido) {
  return pedido.itens.map((i) => `${i.quantidade}× ${i.nome}${i.observacao ? ` (${i.observacao})` : ''}`).join(', ');
}

function CartaoPedidoDeHoje({ pedido, editandoEste, onEditar, onErro }) {
  const [entregando, setEntregando] = useState(false);
  const faltaram = itensQueFaltaram(pedido);
  const pronto = pedido.status === 'pronto';
  const cor = faltaram.length ? 'var(--color-accent-cozinha)' : STATUS[pedido.status].cor;

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
    <li
      className="rounded-2xl border-2 p-4 bg-[var(--surface-card)] flex flex-col gap-3"
      style={{ borderColor: pronto || faltaram.length ? cor : 'var(--border-subtle)' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl font-extrabold text-[var(--text-primary)]">{numeroDoPedido(pedido)}</span>
        <span
          className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full text-white"
          style={{ backgroundColor: STATUS[pedido.status].cor }}
        >
          {STATUS[pedido.status].rotulo}
        </span>
        {editandoEste && <span className="text-sm font-semibold text-[var(--text-secondary)]">editando</span>}
      </div>

      {faltaram.length > 0 && (
        <p className="flex items-start gap-2 text-sm font-semibold" style={{ color: 'var(--color-accent-cozinha)' }}>
          <AlertIcon className="w-5 h-5 shrink-0" />
          A cozinha avisou que faltou: {faltaram.map((i) => i.nome).join(', ')}. Edite ou cancele o pedido.
        </p>
      )}

      <p className="text-sm text-[var(--text-secondary)] break-words">{resumoDosItens(pedido)}</p>

      <div className="flex flex-wrap items-center gap-2">
        {pronto && (
          <button
            type="button"
            onClick={entregar}
            disabled={entregando}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: STATUS.pronto.cor }}
          >
            <CheckIcon className="w-5 h-5" />
            Entregue
          </button>
        )}
        {podeEditar(pedido) && !editandoEste && (
          <button
            type="button"
            onClick={onEditar}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)]"
          >
            <PencilIcon className="w-4 h-4" />
            Editar
          </button>
        )}
        <CancelarPedido pedidoId={pedido.id} onErro={onErro} />
      </div>
    </li>
  );
}

function PedidosDeHoje({ prontos, fila, idEmEdicao, onEditar, onErro }) {
  if (!prontos.length && !fila.length) return null;

  return (
    <section className="mt-10 flex flex-col gap-6">
      {prontos.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Prontos para entregar</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {prontos.map((p) => (
              <CartaoPedidoDeHoje key={p.id} pedido={p} onErro={onErro} onEditar={() => onEditar(p)} />
            ))}
          </ul>
        </div>
      )}
      {fila.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Na cozinha</h2>
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
        </div>
      )}
    </section>
  );
}

function PedidoEnviado({ pedido }) {
  return (
    <div
      role="status"
      className="rounded-2xl p-4 text-center text-white"
      style={{ backgroundColor: 'var(--color-accent-relatorios)' }}
    >
      <p className="text-sm font-semibold">Enviado para a cozinha. Diga ao cliente o número:</p>
      <p className="text-5xl font-extrabold tracking-wider mt-1">{numeroDoPedido(pedido)}</p>
      <p className="text-sm mt-1 opacity-90">Com ele o cliente acompanha a fila pelo QR code.</p>
    </div>
  );
}

export default function Pedidos() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const { produtos, carregando, erro: erroCarga } = useProdutos();
  const { pedidos: abertos } = usePedidosAbertos();

  // Uma linha por produto + observação: "X-Burguer" e "X-Burguer sem salada"
  // ficam separados. [{ chave, produtoId, nome, quantidade, observacao }]
  const [carrinho, setCarrinho] = useState([]);
  // Pedido em edição: { pedido, rascunho } guarda o que estava sendo montado antes.
  const [edicao, setEdicao] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(null);
  const chaveEnvio = useRef(null);

  const porId = Object.fromEntries(produtos.map((p) => [p.id, p]));
  // Na edição, produto que já estava no pedido mantém o preço combinado e pode
  // continuar mesmo que tenha esgotado depois (mesma regra do banco).
  const precoCombinado = Object.fromEntries((edicao?.pedido.itens ?? []).map((i) => [i.produto_id, i.preco_unitario]));
  const linhaValida = (linha) => linha.produtoId in precoCombinado || porId[linha.produtoId]?.disponivel;
  const itens = carrinho
    .filter(linhaValida)
    .map((linha) => ({ ...linha, preco: precoCombinado[linha.produtoId] ?? porId[linha.produtoId].preco }));
  const foraDoCardapio = [...new Set(carrinho.filter((l) => !linhaValida(l)).map((l) => l.nome))];
  const totalItens = itens.reduce((s, i) => s + i.quantidade, 0);
  const total = itens.reduce((s, i) => s + i.quantidade * i.preco, 0);
  const quantidadePorProduto = {};
  for (const linha of itens) {
    quantidadePorProduto[linha.produtoId] = (quantidadePorProduto[linha.produtoId] ?? 0) + linha.quantidade;
  }

  const { fila, prontos } = separarPedidos(abertos);
  const pedidoEditadoAgora = edicao && abertos.find((p) => p.id === edicao.pedido.id);
  // A cozinha pode marcar pronto (ou alguém cancelar) enquanto o atendente edita.
  const edicaoPerdida = edicao && (!pedidoEditadoAgora || !podeEditar(pedidoEditadoAgora));

  function mexerNoCarrinho(atualizar) {
    setEnviado(null);
    // Mudou o pedido: o próximo envio é outro, com outra chave.
    chaveEnvio.current = null;
    setCarrinho(atualizar);
  }

  function adicionar(produto) {
    mexerNoCarrinho((c) => {
      const semObservacao = c.find((l) => l.produtoId === produto.id && !l.observacao.trim());
      if (semObservacao) {
        return c.map((l) => (l === semObservacao ? { ...l, quantidade: l.quantidade + 1 } : l));
      }
      return [...c, { chave: novaChave(), produtoId: produto.id, nome: produto.nome, quantidade: 1, observacao: '' }];
    });
  }

  function mudarQuantidade(chave, delta) {
    mexerNoCarrinho((c) =>
      c
        .map((l) => (l.chave === chave ? { ...l, quantidade: l.quantidade + delta } : l))
        .filter((l) => l.quantidade > 0),
    );
  }

  function mudarObservacao(chave, observacao) {
    mexerNoCarrinho((c) => c.map((l) => (l.chave === chave ? { ...l, observacao } : l)));
  }

  async function comecarEdicao(pedido) {
    setErro('');
    try {
      const completo = await buscarPedidoComValores(pedido.id);
      setEdicao({ pedido: completo, rascunho: edicao ? edicao.rascunho : carrinho });
      setEnviado(null);
      setCarrinho(
        completo.itens.map((i) => ({
          chave: novaChave(),
          produtoId: i.produto_id,
          nome: i.nome,
          quantidade: i.quantidade,
          observacao: i.observacao ?? '',
        })),
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErro(e.message);
    }
  }

  function sairDaEdicao() {
    setCarrinho(edicao?.rascunho ?? []);
    setEdicao(null);
  }

  // O pedido ficou pronto durante a edição: os itens viram um pedido novo.
  function lancarComoNovo() {
    setEdicao(null);
    chaveEnvio.current = null;
  }

  async function enviar() {
    if (!itens.length || enviando) return;
    setErro('');
    setEnviando(true);
    const paraEnviar = itens.map(({ produtoId, quantidade, observacao }) => ({
      produto_id: produtoId,
      quantidade,
      observacao,
    }));
    try {
      if (edicao) {
        await editarPedido(edicao.pedido.id, paraEnviar);
        setEnviado({ ...edicao.pedido, editado: true });
        setCarrinho(edicao.rascunho);
        setEdicao(null);
      } else {
        chaveEnvio.current ??= novaChaveEnvio();
        const pedido = await criarPedido({
          negocioId: perfil.negocio_id,
          usuarioId: perfil.id,
          itens: paraEnviar,
          chaveEnvio: chaveEnvio.current,
        });
        setCarrinho([]);
        chaveEnvio.current = null;
        setEnviado(pedido);
      }
    } catch (e) {
      // A chave continua a mesma: tentar de novo não duplica o pedido.
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

  const textoEnviar = edicao ? 'Salvar alterações' : 'Enviar para a cozinha';

  return (
    <AppShell largura="max-w-6xl">
      <PageHeader
        icon={OrdersIcon}
        accent={ACCENT}
        title={edicao ? `Editando o pedido ${numeroDoPedido(edicao.pedido)}` : 'Novo pedido'}
        subtitle="Toque nos produtos para adicionar"
      />

      {erroCarga && <Aviso className="mb-4">{erroCarga}</Aviso>}

      {produtos.length === 0 && !edicao ? (
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
              const qtd = quantidadePorProduto[p.id] ?? 0;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!p.disponivel}
                    onClick={() => adicionar(p)}
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

          <aside
            className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 lg:sticky lg:top-24 flex flex-col gap-4"
            style={{ borderColor: edicao ? 'var(--color-brand-orange)' : 'var(--border-subtle)' }}
          >
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {edicao ? `Pedido ${numeroDoPedido(edicao.pedido)}` : 'Pedido'}
            </h2>

            {edicaoPerdida && (
              <div className="flex flex-col gap-2">
                <Aviso>
                  Este pedido ficou pronto ou foi encerrado enquanto você editava. As mudanças não podem mais entrar
                  nele.
                </Aviso>
                <button
                  type="button"
                  onClick={lancarComoNovo}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  Lançar estes itens como pedido novo
                </button>
              </div>
            )}

            {enviado && !edicao && (
              enviado.editado ? (
                <Aviso tipo="sucesso">Pedido {numeroDoPedido(enviado)} alterado. A cozinha já está vendo.</Aviso>
              ) : (
                <PedidoEnviado pedido={enviado} />
              )
            )}
            {erro && <Aviso>{erro}</Aviso>}
            {foraDoCardapio.length > 0 && (
              <Aviso>
                {foraDoCardapio.join(', ')} {foraDoCardapio.length === 1 ? 'esgotou e saiu' : 'esgotaram e saíram'} do
                pedido.
              </Aviso>
            )}

            {itens.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] py-4 text-center">Nenhum item ainda.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
                {itens.map((linha) => (
                  <LinhaDoPedido
                    key={linha.chave}
                    linha={linha}
                    onQuantidade={(delta) => mudarQuantidade(linha.chave, delta)}
                    onObservacao={(texto) => mudarObservacao(linha.chave, texto)}
                  />
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
              disabled={!itens.length || enviando || edicaoPerdida}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-4 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: ACCENT }}
            >
              <SendIcon className="w-5 h-5" />
              {enviando ? 'Enviando...' : textoEnviar}
            </button>

            {edicao ? (
              <button
                type="button"
                onClick={sairDaEdicao}
                className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Sair sem salvar
              </button>
            ) : (
              carrinho.length > 0 && (
                <button
                  type="button"
                  onClick={() => mexerNoCarrinho([])}
                  className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Limpar pedido
                </button>
              )
            )}
          </aside>
        </div>
      )}

      <PedidosDeHoje
        prontos={prontos}
        fila={fila}
        idEmEdicao={edicao?.pedido.id}
        onEditar={comecarEdicao}
        onErro={setErro}
      />

      {enviado && !edicao && itens.length === 0 && (
        <div className="lg:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-2 z-10 px-4 pb-2">
          <div className="rounded-2xl bg-[var(--surface-alt)] shadow-lg">
            {enviado.editado ? (
              <Aviso tipo="sucesso">Pedido {numeroDoPedido(enviado)} alterado. A cozinha já está vendo.</Aviso>
            ) : (
              <PedidoEnviado pedido={enviado} />
            )}
          </div>
        </div>
      )}

      {/* Celular: total e envio sempre à mão, acima da barra de navegação */}
      {itens.length > 0 && (
        <>
          <div className="h-20 lg:hidden" aria-hidden="true" />
          <div className="lg:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-2 z-10 px-4 pb-2">
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-alt)] p-3 shadow-lg">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--text-secondary)]">
                  {edicao ? `Pedido ${numeroDoPedido(edicao.pedido)} · ` : ''}
                  {totalItens} {totalItens === 1 ? 'item' : 'itens'}
                </p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{formatarMoeda(total)}</p>
              </div>
              <button
                type="button"
                onClick={enviar}
                disabled={enviando || edicaoPerdida}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: ACCENT }}
              >
                <SendIcon className="w-5 h-5" />
                {enviando ? 'Enviando...' : edicao ? 'Salvar' : 'Enviar'}
              </button>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
