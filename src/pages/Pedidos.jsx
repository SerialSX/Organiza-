import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Botao from '../components/ui/Botao';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import GradeDeProdutos from '../components/pedidos/GradeDeProdutos';
import LinhaDoPedido from '../components/pedidos/LinhaDoPedido';
import PedidosDeHoje from '../components/pedidos/PedidosDeHoje';
import PedidoEnviado from '../components/pedidos/PedidoEnviado';
import DestinoDoPedido from '../components/pedidos/DestinoDoPedido';
import DetalhesDoPedido from '../components/pedidos/DetalhesDoPedido';
import FilaDeEnvio from '../components/pedidos/FilaDeEnvio';
import ContasAbertas from '../components/pedidos/ContasAbertas';
import { OrdersIcon, ProductsIcon, SendIcon } from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';
import { useProdutos } from '../hooks/useProdutos';
import { usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { usePedidosDoDia } from '../hooks/usePedidosDoDia';
import { useFilaDeEnvio } from '../hooks/useFilaDeEnvio';
import { useRascunhoDoPedido, novaChaveDeLinha } from '../hooks/useRascunhoDoPedido';
import { criarPedido, editarPedido, buscarPedidoComValores } from '../services/pedidos';
import { registrarToqueEsgotado } from '../services/produtos';
import { guardarNaFila } from '../services/filaDeEnvio';
import { formatarMoeda, numeroDoPedido } from '../lib/formatadores';
import { podeEditar } from '../lib/pedidoStatus';
import { separarPedidos } from '../lib/fila';
import { contasAbertas } from '../lib/caixa';

const ACCENT = 'var(--color-accent-pedidos)';
// Acima da barra de navegação do celular; no tablet sem essa barra, no rodapé.
const BARRA_FIXA = 'lg:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-2 z-10 px-4 pb-2';
const BALCAO = { tipo: 'balcao', mesa: '' };
const ID_CAMPO_MESA = 'numero-da-mesa';

function novaChaveEnvio() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resumo(itens) {
  return itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ');
}

function MensagemDeEnvio({ enviado }) {
  if (enviado.guardado) {
    return (
      <Aviso tipo="info">
        Sem internet. O pedido foi guardado neste aparelho e vai para a cozinha sozinho quando a conexão voltar.
      </Aviso>
    );
  }
  return enviado.editado ? (
    <Aviso tipo="sucesso">Pedido {numeroDoPedido(enviado)} alterado. A cozinha já está vendo.</Aviso>
  ) : (
    <PedidoEnviado pedido={enviado} />
  );
}

export default function Pedidos() {
  const { perfil } = useAuth();
  const { produtos, carregando, erro: erroCarga } = useProdutos();
  const { pedidos: abertos } = usePedidosAbertos();
  const { pedidos: doDia } = usePedidosDoDia();
  const semTelaCozinha = perfil.usa_tela_cozinha === false;

  // Pedido em edição: { pedido } com os itens e preços como estavam no banco.
  const [edicao, setEdicao] = useState(null);
  // Uma linha por produto + observação: "X-Burguer" e "X-Burguer sem salada"
  // ficam separados. [{ chave, produtoId, nome, quantidade, observacao }]
  const [carrinho, setCarrinho] = useRascunhoDoPedido(perfil.negocio_id, Boolean(edicao));
  const [rascunhoGuardado, setRascunhoGuardado] = useState([]);
  // Balcão ou mesa. Na edição, o destino do pedido montado fica guardado à parte.
  const [destino, setDestino] = useState(BALCAO);
  const [destinoGuardado, setDestinoGuardado] = useState(BALCAO);
  const [erroMesa, setErroMesa] = useState('');
  const [identificacao, setIdentificacao] = useState('');
  const [forma, setForma] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviado, setEnviado] = useState(null);
  // Cópia da senha na barra de baixo (celular): some sozinha depois de 15 s
  // para não cobrir o fim da página (contas abertas, pedidos de hoje).
  const [barraOcultaDe, setBarraOcultaDe] = useState(null);
  const barraEnviado = Boolean(enviado) && barraOcultaDe !== enviado;
  const chaveEnvio = useRef(null);

  useEffect(() => {
    if (!enviado) return undefined;
    const id = setTimeout(() => setBarraOcultaDe(enviado), 15000);
    return () => clearTimeout(id);
  }, [enviado]);

  const aoSairDaFila = useCallback((pedido, envio) => {
    setEnviado({ ...pedido, itens: envio.linhas ?? [] });
  }, []);
  const { fila: filaDeEnvio, tentarAgora, descartar } = useFilaDeEnvio({
    negocioId: perfil.negocio_id,
    usuarioId: perfil.id,
    onEnviado: aoSairDaFila,
  });

  const porId = Object.fromEntries(produtos.map((p) => [p.id, p]));
  // Na edição, produto que já estava no pedido mantém o preço combinado e pode
  // continuar mesmo que tenha esgotado depois (mesma regra do banco).
  const precoCombinado = Object.fromEntries((edicao?.pedido.itens ?? []).map((i) => [i.produto_id, i.preco_unitario]));
  const linhaValida = (linha) => linha.produtoId in precoCombinado || porId[linha.produtoId]?.disponivel;
  const itens = carregando
    ? []
    : carrinho
        .filter(linhaValida)
        .map((linha) => ({ ...linha, preco: precoCombinado[linha.produtoId] ?? porId[linha.produtoId].preco }));
  const foraDoCardapio = carregando ? [] : [...new Set(carrinho.filter((l) => !linhaValida(l)).map((l) => l.nome))];
  const totalItens = itens.reduce((s, i) => s + i.quantidade, 0);
  const total = itens.reduce((s, i) => s + i.quantidade * i.preco, 0);
  const quantidadePorProduto = {};
  for (const linha of itens) {
    quantidadePorProduto[linha.produtoId] = (quantidadePorProduto[linha.produtoId] ?? 0) + linha.quantidade;
  }

  const { fila, prontos } = separarPedidos(abertos);
  const contas = contasAbertas(doDia);
  const pedidoAgora = edicao && abertos.find((p) => p.id === edicao.pedido.id);
  // Enquanto o atendente edita, a cozinha pode marcar pronto, alguém pode
  // cancelar ou outra pessoa pode editar o mesmo pedido.
  const edicaoPerdida = Boolean(edicao) && (!pedidoAgora || !podeEditar(pedidoAgora));
  const editadoPorOutro =
    Boolean(edicao) && !edicaoPerdida && (pedidoAgora.alterado_em ?? null) !== (edicao.pedido.alterado_em ?? null);

  function mexerNoCarrinho(atualizar) {
    setEnviado(null);
    setAviso('');
    // Mudou o pedido: o próximo envio é outro, com outra chave.
    chaveEnvio.current = null;
    setCarrinho(atualizar);
  }

  function mexerNoDestino(novo) {
    setEnviado(null);
    chaveEnvio.current = null;
    setErroMesa('');
    setDestino(novo);
  }

  function adicionar(produto) {
    mexerNoCarrinho((c) => {
      const semObservacao = c.find((l) => l.produtoId === produto.id && !l.observacao.trim());
      if (semObservacao) {
        return c.map((l) => (l === semObservacao ? { ...l, quantidade: l.quantidade + 1 } : l));
      }
      return [...c, { chave: novaChaveDeLinha(), produtoId: produto.id, nome: produto.nome, quantidade: 1, observacao: '' }];
    });
  }

  // Tocou num esgotado: avisa e conta a venda que teria saído errada.
  function tocouEsgotado(produto) {
    setAviso(`${produto.nome} está esgotado. Ofereça outra opção ao cliente.`);
    registrarToqueEsgotado(produto.id);
  }

  function mudarQuantidade(chave, delta) {
    mexerNoCarrinho((c) =>
      c.map((l) => (l.chave === chave ? { ...l, quantidade: l.quantidade + delta } : l)).filter((l) => l.quantidade > 0),
    );
  }

  function mudarObservacao(chave, observacao) {
    mexerNoCarrinho((c) => c.map((l) => (l.chave === chave ? { ...l, observacao } : l)));
  }

  async function comecarEdicao(pedido) {
    setErro('');
    try {
      const completo = await buscarPedidoComValores(pedido.id);
      // O que estava sendo montado volta quando a edição terminar.
      if (!edicao) {
        setRascunhoGuardado(carrinho);
        setDestinoGuardado(destino);
      }
      setEdicao({ pedido: completo });
      setEnviado(null);
      setErroMesa('');
      setDestino(completo.mesa ? { tipo: 'mesa', mesa: String(completo.mesa) } : BALCAO);
      setCarrinho(
        completo.itens.map((i) => ({
          chave: novaChaveDeLinha(),
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
    setEdicao(null);
    setCarrinho(rascunhoGuardado);
    setDestino(destinoGuardado);
    setErroMesa('');
  }

  // O pedido ficou pronto durante a edição: os itens viram um pedido novo.
  function lancarComoNovo() {
    setEdicao(null);
    chaveEnvio.current = null;
  }

  function limparDetalhes() {
    setIdentificacao('');
    setForma(null);
  }

  async function enviar() {
    if (!itens.length || enviando) return;
    const mesa = destino.tipo === 'mesa' ? Number(destino.mesa) : null;
    if (destino.tipo === 'mesa' && !(mesa >= 1 && mesa <= 999)) {
      setErroMesa('Digite o número da mesa (de 1 a 999).');
      document.getElementById(ID_CAMPO_MESA)?.focus();
      return;
    }
    setErro('');
    setAviso('');
    setEnviando(true);
    const paraEnviar = itens.map(({ produtoId, quantidade, observacao }) => ({ produto_id: produtoId, quantidade, observacao }));
    const linhas = itens.map(({ nome, quantidade, observacao }) => ({ nome, quantidade, observacao }));
    try {
      if (edicao) {
        await editarPedido(edicao.pedido.id, paraEnviar, edicao.pedido.alterado_em, mesa);
        setEnviado({ ...edicao.pedido, editado: true });
        setEdicao(null);
        setCarrinho(rascunhoGuardado);
        setDestino(destinoGuardado);
      } else {
        chaveEnvio.current ??= novaChaveEnvio();
        const pedido = await criarPedido({
          negocioId: perfil.negocio_id,
          usuarioId: perfil.id,
          itens: paraEnviar,
          chaveEnvio: chaveEnvio.current,
          mesa,
          identificacao,
          formaPagamento: forma,
        });
        setCarrinho([]);
        limparDetalhes();
        chaveEnvio.current = null;
        // Próximo pedido: mesmo tipo (quem atende no salão segue de mesa em
        // mesa), com o número em branco para não ir para a mesa errada.
        setDestino((d) => ({ ...d, mesa: '' }));
        setEnviado({ ...pedido, itens: linhas });
      }
    } catch (e) {
      if (e.semInternet && !edicao) {
        // Guarda com a mesma chave: se o envio chegou antes da queda, o
        // reenvio devolve o mesmo pedido em vez de criar outro.
        guardarNaFila(perfil.negocio_id, {
          chaveEnvio: chaveEnvio.current,
          itens: paraEnviar,
          linhas,
          mesa,
          identificacao,
          formaPagamento: forma,
          resumo: resumo(linhas),
        });
        setCarrinho([]);
        limparDetalhes();
        chaveEnvio.current = null;
        setEnviado({ guardado: true });
      } else {
        // A chave continua a mesma: tentar de novo não duplica o pedido.
        setErro(e.message);
      }
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <AppShell>
        <Carregando texto="Carregando o cardápio…" />
      </AppShell>
    );
  }

  const numeroEmEdicao = edicao && numeroDoPedido(edicao.pedido);
  // Celular: espaço no fim da página para a barra fixa de baixo não cobrir
  // o último cartão nem o contato da equipe.
  const barraDeEnvio = itens.length > 0;
  const barraDeEnviado = Boolean(enviado) && barraEnviado && !edicao && !barraDeEnvio;
  const reservaNoFim = barraDeEnvio ? 'h-28 lg:hidden' : barraDeEnviado ? 'h-56 lg:hidden' : '';
  const podeEnviar = itens.length > 0 && !enviando && !edicaoPerdida;

  return (
    <AppShell largura="max-w-6xl" reservaNoFim={reservaNoFim}>
      <PageHeader
        icon={OrdersIcon}
        accent={ACCENT}
        title={edicao ? `Editando o pedido ${numeroEmEdicao}` : 'Novo pedido'}
        subtitle="Toque nos produtos para adicionar"
      />

      {erroCarga && <Aviso className="mb-4">{erroCarga}</Aviso>}

      <FilaDeEnvio fila={filaDeEnvio} onTentar={tentarAgora} onDescartar={descartar} />

      {produtos.length === 0 && !edicao ? (
        <EstadoVazio
          icon={ProductsIcon}
          accent="var(--color-accent-produtos)"
          titulo="Cadastre seus produtos primeiro"
          texto="Os pedidos são montados a partir dos produtos do seu cardápio. Dá para começar com um cardápio pronto."
        >
          <Botao para="/produtos" cor="var(--color-accent-produtos)" tamanho="grande" className="mt-2">
            Ir para Produtos
          </Botao>
        </EstadoVazio>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
          <GradeDeProdutos
            produtos={produtos}
            quantidadePorProduto={quantidadePorProduto}
            onAdicionar={adicionar}
            onEsgotado={tocouEsgotado}
          />

          <aside
            aria-labelledby="titulo-carrinho"
            className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 lg:sticky lg:top-24 flex flex-col gap-4"
            style={{ borderColor: edicao ? 'var(--color-brand-orange)' : 'var(--border-subtle)' }}
          >
            <h2 id="titulo-carrinho" className="text-lg font-semibold text-[var(--text-primary)]">
              {edicao ? `Pedido ${numeroEmEdicao}` : 'Pedido'}
            </h2>

            <DestinoDoPedido destino={destino} onMudar={mexerNoDestino} erroMesa={erroMesa} idCampoMesa={ID_CAMPO_MESA} />

            {edicaoPerdida && (
              <div className="flex flex-col gap-2">
                <Aviso>
                  Este pedido ficou pronto ou foi encerrado enquanto você editava. As mudanças não podem mais entrar nele.
                </Aviso>
                <Botao cor={ACCENT} onClick={lancarComoNovo}>
                  Lançar estes itens como pedido novo
                </Botao>
              </div>
            )}
            {editadoPorOutro && (
              <div className="flex flex-col gap-2">
                <Aviso tipo="info">Outra pessoa alterou este pedido agora há pouco.</Aviso>
                <Botao variante="secundaria" onClick={() => comecarEdicao(edicao.pedido)}>
                  Abrir de novo como ficou
                </Botao>
              </div>
            )}

            <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
              {enviado && !edicao && <MensagemDeEnvio enviado={enviado} />}
              {erro && <Aviso>{erro}</Aviso>}
              {aviso && <Aviso tipo="info">{aviso}</Aviso>}
              {foraDoCardapio.length > 0 && (
                <Aviso>
                  {foraDoCardapio.join(', ')} {foraDoCardapio.length === 1 ? 'esgotou e saiu' : 'esgotaram e saíram'} do pedido.
                </Aviso>
              )}
            </div>

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

            {!edicao && itens.length > 0 && (
              <DetalhesDoPedido
                identificacao={identificacao}
                onIdentificacao={setIdentificacao}
                forma={forma}
                onForma={setForma}
              />
            )}

            <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
              <span className="text-[var(--text-secondary)] tabular-nums">
                Total{totalItens > 0 && ` (${totalItens} ${totalItens === 1 ? 'item' : 'itens'})`}
              </span>
              <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{formatarMoeda(total)}</span>
            </div>

            <Botao cor={ACCENT} tamanho="grande" larguraTotal onClick={enviar} disabled={!podeEnviar}>
              <SendIcon className="w-5 h-5" />
              {enviando ? 'Enviando…' : edicao ? 'Salvar alterações' : semTelaCozinha ? 'Lançar pedido' : 'Enviar para a cozinha'}
            </Botao>

            {edicao ? (
              <Botao variante="texto" onClick={sairDaEdicao}>
                Sair sem salvar
              </Botao>
            ) : (
              carrinho.length > 0 && (
                <Botao variante="texto" onClick={() => mexerNoCarrinho([])}>
                  Limpar pedido
                </Botao>
              )
            )}
          </aside>
        </div>
      )}

      <PedidosDeHoje
        prontos={prontos}
        fila={fila}
        idEmEdicao={edicao?.pedido.id}
        semTelaCozinha={semTelaCozinha}
        onEditar={comecarEdicao}
        onErro={setErro}
      />

      <ContasAbertas contas={contas} onErro={setErro} />

      {/* Cópia visual do aviso do carrinho: o leitor de tela já ouviu lá */}
      {barraDeEnviado && (
        <>
          <div className={BARRA_FIXA} aria-hidden="true" onClick={() => setBarraOcultaDe(enviado)}>
            <div className="rounded-2xl bg-[var(--surface-alt)] shadow-lg">
              <MensagemDeEnvio enviado={enviado} />
            </div>
          </div>
        </>
      )}

      {/* Celular: total e envio sempre à mão. O erro aparece aqui também: lá
          em cima, no carrinho, ele ficaria fora da tela. */}
      {barraDeEnvio && (
        <>
          <div className={BARRA_FIXA}>
            <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-alt)] p-3 shadow-lg">
              {erro && (
                <p className="text-sm font-semibold text-[var(--texto-cozinha)]" aria-hidden="true">
                  {erro}
                </p>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs tabular-nums text-[var(--text-secondary)]">
                    {edicao ? `Pedido ${numeroEmEdicao}, ` : ''}
                    {destino.tipo === 'mesa' && destino.mesa ? `mesa ${destino.mesa}, ` : ''}
                    {!edicao && identificacao.trim() ? `${identificacao.trim()}, ` : ''}
                    {totalItens} {totalItens === 1 ? 'item' : 'itens'}
                  </p>
                  <p className="text-lg font-bold tabular-nums text-[var(--text-primary)]">{formatarMoeda(total)}</p>
                </div>
                <Botao cor={ACCENT} tamanho="grande" onClick={enviar} disabled={!podeEnviar}>
                  <SendIcon className="w-5 h-5" />
                  {enviando ? 'Enviando…' : edicao ? 'Salvar' : erro ? 'Tentar de novo' : 'Enviar'}
                </Botao>
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
