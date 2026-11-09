import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import MapaDeMesas, { ID_MAPA } from '../components/mesas/MapaDeMesas';
import ContaDaMesa from '../components/mesas/ContaDaMesa';
import SugestaoDeMesas from '../components/mesas/SugestaoDeMesas';
import ResolverPendencias from '../components/fimDoDia/ResolverPendencias';
import { OrdersIcon, ProductsIcon, SendIcon } from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';
import { useProdutos } from '../hooks/useProdutos';
import { CONFERENCIA_LONGA, usePedidosAbertos } from '../hooks/usePedidosAbertos';
import { usePedidosDoDia } from '../hooks/usePedidosDoDia';
import { usePendenciasAnteriores } from '../hooks/usePendenciasAnteriores';
import { useFilaDeEnvio } from '../hooks/useFilaDeEnvio';
import { useRascunhoDoPedido, novaChaveDeLinha } from '../hooks/useRascunhoDoPedido';
import { criarPedido, editarPedido, buscarPedidoComValores, nomeComTamanho, ROTULO_FORMA } from '../services/pedidos';
import { aceitaMeioAMeio, registrarToqueEsgotado } from '../services/produtos';
import EscolherMeioAMeio from '../components/pedidos/EscolherMeioAMeio';
import EscolherCombo from '../components/pedidos/EscolherCombo';
import { useAgora, useCombos } from '../hooks/useCombos';
import { aceitaCombos } from '../services/combos';
import {
  agruparItens,
  chaveDoCombo,
  ehFixa,
  escolhaDaOpcao,
  metadesCombinam,
  opcaoDisponivel,
  opcaoNoCardapio,
  opcoesEscolhidas,
  precoDoCombo,
  resumoDoCombo,
  situacaoDoCombo,
  textoDasEscolhas,
} from '../lib/combos';
import { itensDoCarrinho } from '../lib/itensDoCarrinho';
import { precoDaEdicao, promocaoDasMetades } from '../lib/precosDoPedido';
import { precoEmPromocao } from '../lib/promocoes';
import { nomeDoItem, precoMeioAMeio, tamanhoQueCombina } from '../lib/meioAMeio';
import { guardarNaFila } from '../services/filaDeEnvio';
import { destinoDoPedido, formatarMoeda, hojeNoNegocio, numeroDoPedido } from '../lib/formatadores';
import { podeEditar } from '../lib/pedidoStatus';
import { separarPedidos } from '../lib/fila';
import { contasAbertas, totalDoPedido } from '../lib/caixa';
import { atendeNaMesa, atendeNoBalcao, destinoInicial, modoDoNegocio, taxaDoNegocio, usaMapaDeMesas } from '../lib/atendimento';
import { montarMapa, proximaMesaExtra } from '../lib/mesas';
import { pendenciasDoDia, quantosPedidos } from '../lib/fimDoDia';

const ACCENT = 'var(--color-accent-pedidos)';
// Acima da barra de navegação do celular; no tablet sem essa barra, no rodapé.
const BARRA_FIXA = 'lg:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-2 z-10 px-4 pb-2';
const ID_CAMPO_MESA = 'numero-da-mesa';
const ID_PAGAMENTO = 'pagamento-do-pedido';
const ID_CARDAPIO = 'cardapio-do-pedido';

// Leva a tela até um ponto (o mapa, o cardápio) e põe o foco nele.
function irPara(id, foco = null) {
  const alvo = document.getElementById(id);
  alvo?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  (foco ? alvo?.querySelector(foco) : null)?.focus({ preventScroll: true });
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
  if (enviado.editado && enviado.voltouAReceber) {
    return (
      <Aviso tipo="info">
        Pedido {numeroDoPedido(enviado)} alterado. Como o valor mudou, ele voltou para “A receber”: registre o pagamento de
        novo no Caixa.
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
  // Combos e promoções (banco sem a migração 2026-11-15: listas vazias).
  const { combos, promocoes } = useCombos();
  // A promoção começa e acaba com a tela aberta.
  const agora = useAgora();
  const comCombos = aceitaCombos();
  const { pedidos: abertos } = usePedidosAbertos(CONFERENCIA_LONGA);
  const { pedidos: doDia, carregando: carregandoDia } = usePedidosDoDia(null, { comContas: false, comEncerramento: false });
  const { pedidos: anteriores, carregando: carregandoAnteriores } = usePendenciasAnteriores();
  // ?resolver=2026-11-07: veio do "Encerrar o dia" do Caixa com coisa em aberto.
  const [parametros] = useSearchParams();
  const pedidoResolver = parametros.get('resolver') ?? '';
  const diaResolver = /^\d{4}-\d{2}-\d{2}$/.test(pedidoResolver) ? pedidoResolver : null;
  const hoje = hojeNoNegocio();
  const resolverHoje = diaResolver === hoje;
  const paraResolver = !diaResolver ? [] : resolverHoje ? doDia : anteriores.filter((p) => p.dia === diaResolver);
  const carregandoResolver = resolverHoje ? carregandoDia : carregandoAnteriores;
  const resolvido = Boolean(diaResolver) && !carregandoResolver && pendenciasDoDia(paraResolver).total === 0;
  const pendentesAnteriores = pendenciasDoDia(anteriores).total;
  const semTelaCozinha = perfil.usa_tela_cozinha === false;
  // Balcão, mesa ou os dois (perguntas de boas-vindas / Minha conta).
  const modo = modoDoNegocio(perfil);
  const inicial = destinoInicial(modo);
  // Mapa das mesas: toca na mesa em vez de digitar o número.
  const mapaAtivo = usaMapaDeMesas(perfil);
  const taxa = taxaDoNegocio(perfil);
  // Conta aberta na janela: a mesa e os pedidos que ela tinha ao abrir. Se a
  // conta fechar em outro aparelho, a janela some e não volta sozinha quando
  // outro cliente sentar.
  const [contaAberta, setContaAberta] = useState(null);
  const [avisoMesas, setAvisoMesas] = useState('');

  // Pedido em edição: { pedido } com os itens e preços como estavam no banco.
  const [edicao, setEdicao] = useState(null);
  // Produto cujo meio a meio está sendo escolhido (a janela fica aberta).
  const [meioDe, setMeioDe] = useState(null);
  // Combo cujas opções estão sendo escolhidas.
  const [comboDe, setComboDe] = useState(null);
  // Uma linha por produto, tamanho e observação: "X-Burguer" e "X-Burguer sem
  // salada" ficam separados, e a pizza P da G também.
  // [{ chave, produtoId, tamanhoId, segundoId (meio a meio), nome, quantidade, observacao }]
  // Combo: [{ chave, comboId, escolhas: [{ produtoId, tamanhoId, segundoId }], nome, detalhe, quantidade, observacao }]
  const [carrinho, setCarrinho, chaveEnvio, garantirChave, concluirEnvio, trocarChave] = useRascunhoDoPedido(perfil.negocio_id, Boolean(edicao));
  const [rascunhoGuardado, setRascunhoGuardado] = useState([]);
  // Balcão ou mesa. Na edição, o destino do pedido montado fica guardado à parte.
  const [destino, setDestino] = useState(inicial);
  const [destinoGuardado, setDestinoGuardado] = useState(inicial);
  const [erroMesa, setErroMesa] = useState('');
  const [erroPagamento, setErroPagamento] = useState('');
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

  useEffect(() => {
    if (!enviado) return undefined;
    const id = setTimeout(() => setBarraOcultaDe(enviado), 15000);
    return () => clearTimeout(id);
  }, [enviado]);

  // O pedido guardado sem internet saiu: o número aparece grande aqui, com o
  // que ele era, e sai do aviso das outras telas.
  const aoSairDaFila = useCallback(
    (pedido, envio) => {
      setEnviado({ ...pedido, itens: envio.linhas ?? [], resumoDaFila: envio.resumo ?? '' });
    },
    [],
  );
  const { fila: filaDeEnvio, tentarAgora, tentarDeNovo, descartar } = useFilaDeEnvio({
    negocioId: perfil.negocio_id,
    usuarioId: perfil.id,
    onEnviado: aoSairDaFila,
  });

  const porId = Object.fromEntries(produtos.map((p) => [p.id, p]));
  // Mesma chave do banco: produto, tamanho e segundo sabor (meio a meio).
  const chaveDe = (produtoId, tamanhoId, segundoId) => `${produtoId}|${tamanhoId ?? ''}|${segundoId ?? ''}`;
  const chaveDaLinha = (l) => (l.comboId ? chaveDoCombo(l.comboId, l.escolhas) : chaveDe(l.produtoId, l.tamanhoId, l.segundoId));
  const comboPorId = Object.fromEntries(combos.map((c) => [c.id, c]));
  // Na edição, o item que já estava no pedido (produto, tamanho e sabores; o
  // combo com as mesmas escolhas) mantém o preço combinado, mesmo o da
  // promoção que já acabou, e pode continuar mesmo que tenha esgotado ou
  // saído do cardápio depois (mesma regra do banco).
  const precoCombinado = {};
  const promocaoCombinada = {};
  for (const l of agruparItens(edicao?.pedido.itens ?? [])) {
    const chave = l.combo
      ? chaveDoCombo(
          l.combo_id,
          l.itens.map((i) => ({ produtoId: i.produto_id, tamanhoId: i.tamanho_id, segundoId: i.segundo_produto_id })),
        )
      : chaveDe(l.item.produto_id, l.item.tamanho_id, l.item.segundo_produto_id);
    (precoCombinado[chave] ??= []).push({
      preco: l.combo ? l.preco_unitario : l.item.preco_unitario,
      quantidade: l.combo ? l.quantidade : l.item.quantidade,
    });
    precoCombinado[chave].sort((a,b)=>a.preco-b.preco);
    promocaoCombinada[chave] = (l.combo ? l.itens[0].promocao : l.item.promocao) ?? null;
  }
  // O preço de agora: { preco, normal, promocao } com a promoção que vale agora.
  function precoAgora(produto, tamanho) {
    const normal = (tamanho ?? produto).preco;
    const promo = precoEmPromocao(promocoes, { produtoId: produto.id, tamanhoId: tamanho?.id ?? null }, normal, agora);
    return { preco: promo ? promo.preco : normal, normal, promocao: promo?.promocao ?? null };
  }
  function precoDoComboAgora(combo) {
    const promo = precoEmPromocao(promocoes, { comboId: combo.id }, combo.preco, agora);
    return { preco: promo ? promo.preco : combo.preco, normal: combo.preco, promocao: promo?.promocao ?? null };
  }
  const regraMeioAMeio = perfil.regra_meio_a_meio ?? null;
  const tamanhoDa = (linha) => porId[linha.produtoId]?.tamanhos?.find((t) => t.id === linha.tamanhoId);
  // O primeiro sabor (ou o produto inteiro) hoje no cardápio: null quando não pode mais entrar.
  function primeiroNoCardapio(linha) {
    const produto = porId[linha.produtoId];
    if (!produto?.disponivel) return null;
    if (!linha.tamanhoId) return produto.tamanhos?.length ? null : produto;
    const tamanho = tamanhoDa(linha);
    return tamanho?.disponivel ? tamanho : null;
  }
  // O segundo sabor hoje: marcado, com o mesmo tamanho e sem esgotar.
  function segundoNoCardapio(linha) {
    const segundo = porId[linha.segundoId];
    if (!segundo?.disponivel || !segundo.meio_a_meio || !porId[linha.produtoId]?.meio_a_meio) return null;
    const doSegundo = tamanhoQueCombina(segundo, tamanhoDa(linha)?.nome ?? null);
    if (doSegundo === undefined || (doSegundo && !doSegundo.disponivel)) return null;
    return doSegundo ?? segundo;
  }
  // O combo do jeito que foi montado, hoje: { preco, promocao } ou null quando
  // não pode mais entrar (esgotou, foi desligado ou mudou no cardápio).
  function comboNoCardapio(linha) {
    const combo = comboPorId[linha.comboId];
    if (!combo || !combo.disponivel || combo.partes.length !== linha.escolhas.length) return null;
    const escolhidas = opcoesEscolhidas(combo, linha.escolhas, porId);
    for (const [i, e] of escolhidas.entries()) {
      if (!e || !opcaoDisponivel(e.opcao, porId)) return null;
      if (linha.escolhas[i].segundoId && (!e.segunda || !opcaoDisponivel(e.segunda, porId) || !metadesCombinam(e.opcao, e.segunda, porId))) {
        return null;
      }
    }
    const { preco, promocao } = precoDoComboAgora(combo);
    return { preco: precoDoCombo(preco, combo, linha.escolhas, porId), promocao };
  }
  // O preço que a linha teria hoje no cardápio (com a promoção que vale
  // agora): { preco, promocao } ou null quando não pode mais entrar.
  function noCardapio(linha) {
    if (linha.comboId) return comboNoCardapio(linha);
    const primeiro = primeiroNoCardapio(linha);
    if (!primeiro) return null;
    const doPrimeiro = precoAgora(porId[linha.produtoId], linha.tamanhoId ? primeiro : null);
    if (!linha.segundoId) return { preco: doPrimeiro.preco, promocao: doPrimeiro.promocao };
    const segundo = regraMeioAMeio ? segundoNoCardapio(linha) : null;
    if (!segundo) return null;
    const produtoSegundo = porId[linha.segundoId];
    const doSegundo = precoAgora(produtoSegundo, segundo === produtoSegundo ? null : segundo);
    // Mesma regra do banco: cada metade com a promoção dela, e a regra por cima.
    const preco = precoMeioAMeio(regraMeioAMeio, doPrimeiro.preco, doSegundo.preco);
    const cheio = precoMeioAMeio(regraMeioAMeio, doPrimeiro.normal, doSegundo.normal);
    return { preco, promocao: preco < cheio ? promocaoDasMetades(regraMeioAMeio, doPrimeiro, doSegundo) : null };
  }
  const linhaValida = (linha) => chaveDaLinha(linha) in precoCombinado || noCardapio(linha) !== null;
  const itens = carregando
    ? []
    : carrinho.filter(linhaValida).map((linha) => {
        const chave = chaveDaLinha(linha);
        const combinado = chave in precoCombinado;
        const hoje = noCardapio(linha);
        const valores = precoDaEdicao(linha.quantidade, precoCombinado[chave], hoje?.preco);
        return {
          ...linha,
          ...valores,
          preco: valores.totalLinha / linha.quantidade,
          excedenteIndisponivel: valores.excedente > 0 && !hoje,
          promocao: combinado ? promocaoCombinada[chave] : (hoje?.promocao?.nome ?? null),
        };
      });
  // Saiu do pedido: esgotou, ou o produto mudou de tamanhos (rascunho antigo),
  // ou o meio a meio não combina mais (sabor desmarcado ou sem o tamanho), ou
  // o combo mudou no cardápio.
  const todasInvalidas = carregando ? [] : carrinho.filter((l) => !linhaValida(l));
  const invalidas = todasInvalidas.filter((l) => !l.comboId);
  const comboMudou = (l) => {
    const combo = comboPorId[l.comboId];
    if (!combo) return false;
    return (
      combo.partes.length !== l.escolhas.length ||
      opcoesEscolhidas(combo, l.escolhas, porId).some((e) => !e || !opcaoNoCardapio(e.opcao, porId))
    );
  };
  const combosInvalidos = todasInvalidas.filter((l) => l.comboId);
  const combosMudaram = [...new Set(combosInvalidos.filter(comboMudou).map((l) => l.nome))];
  const mudouNoCardapio = (l) =>
    porId[l.produtoId]?.disponivel && (l.tamanhoId ? !tamanhoDa(l) : porId[l.produtoId].tamanhos?.length > 0);
  // Meio a meio que não combina mais: um dos sabores foi desmarcado, saiu do
  // cardápio ou não tem mais o tamanho. (Esgotado entra no aviso de esgotou.)
  const meioNaoCombina = (l) => {
    if (!l.segundoId || mudouNoCardapio(l) || !primeiroNoCardapio(l)) return false;
    const segundo = porId[l.segundoId];
    if (!segundo || !segundo.meio_a_meio || !porId[l.produtoId].meio_a_meio) return true;
    return tamanhoQueCombina(segundo, tamanhoDa(l)?.nome ?? null) === undefined;
  };
  const meioMudou = [...new Set(invalidas.filter(meioNaoCombina).map((l) => l.nome))];
  const foraDoCardapio = [
    ...new Set([
      ...invalidas.filter((l) => !mudouNoCardapio(l) && !meioNaoCombina(l)).map((l) => l.nome),
      ...combosInvalidos.filter((l) => !comboMudou(l)).map((l) => l.nome),
    ]),
  ];
  const tamanhosMudaram = [...new Set(invalidas.filter(mudouNoCardapio).map((l) => l.nome))];
  const totalItens = itens.reduce((s, i) => s + i.quantidade, 0);
  const total = itens.reduce((s, i) => s + i.quantidade * i.preco, 0);
  // Em centavos, para a ordem da soma não criar diferença de 0,0000001.
  const totalPago = edicao ? totalDoPedido(edicao.pedido) : 0;
  const valorMudou = Math.round(total * 100) !== Math.round(totalPago * 100);
  // Quanto já tem no pedido: por produto e por tamanho ("produto|tamanho").
  const quantidadePorProduto = {};
  // O meio a meio conta à parte ("meio|produto"), no botão dele.
  for (const linha of itens) {
    // O combo conta no cartão dele ("combo|id").
    if (linha.comboId) {
      quantidadePorProduto[`combo|${linha.comboId}`] = (quantidadePorProduto[`combo|${linha.comboId}`] ?? 0) + linha.quantidade;
      continue;
    }
    quantidadePorProduto[linha.produtoId] = (quantidadePorProduto[linha.produtoId] ?? 0) + linha.quantidade;
    const chave = linha.segundoId ? `meio|${linha.produtoId}` : `${linha.produtoId}|${linha.tamanhoId ?? ''}`;
    quantidadePorProduto[chave] = (quantidadePorProduto[chave] ?? 0) + linha.quantidade;
  }

  // Os combos da grade, com o que impede cada um de sair e o preço de agora.
  const combosDaGrade = comCombos
    ? combos.map((combo) => {
        const situacao = situacaoDoCombo(combo, porId);
        return {
          combo,
          ...situacao,
          agora: precoDoComboAgora(combo),
          temEscolha: !combo.partes.every(ehFixa),
          resumo: resumoDoCombo(combo, porId),
        };
      })
    : [];

  const { fila, prontos } = separarPedidos(abertos);
  const contas = mapaAtivo ? [] : contasAbertas(doDia);
  const mapa = mapaAtivo ? montarMapa(doDia, perfil.quantidade_mesas) : [];
  const sugestaoExtra = mapaAtivo ? proximaMesaExtra(mapa, perfil.quantidade_mesas) : null;
  // Mesa extra recém-aberta (ainda sem pedido) aparece no mapa já escolhida.
  const mesaEscolhida = destino.tipo === 'mesa' && destino.mesa ? Number(destino.mesa) : null;
  if (mapaAtivo && mesaEscolhida && !mapa.some((m) => m.mesa === mesaEscolhida)) {
    mapa.push({ mesa: mesaEscolhida, nome: destino.nomeMesa ?? null, extra: true, pedidos: [], total: 0 });
  }
  const mesaDaConta =
    contaAberta && mapa.find((m) => m.mesa === contaAberta.mesa && m.pedidos.some((p) => contaAberta.ids.includes(p.id)));
  const pedidoAgora = edicao && abertos.find((p) => p.id === edicao.pedido.id);
  // Enquanto o atendente edita, a cozinha pode marcar pronto, alguém pode
  // cancelar ou outra pessoa pode editar o mesmo pedido.
  const edicaoPerdida = Boolean(edicao) && (!pedidoAgora || !podeEditar(pedidoAgora));
  const editadoPorOutro =
    Boolean(edicao) && !edicaoPerdida && (pedidoAgora.alterado_em ?? null) !== (edicao.pedido.alterado_em ?? null);

  function mexerNoCarrinho(atualizar) {
    trocarChave();
    setEnviado(anterior => anterior?.resumoDaFila ? anterior : null);
    setAviso('');
    setCarrinho(atualizar);
  }

  function mexerNoDestino(novo) {
    trocarChave();
    setEnviado(null);
    setErroMesa('');
    setDestino(novo);
  }

  // Tocou numa mesa (livre no mapa ou "Lançar mais"): o pedido em montagem é dela.
  function pedirNaMesa(mesa) {
    setAvisoMesas('');
    setContaAberta(null);
    mexerNoDestino({ tipo: 'mesa', mesa: String(mesa.mesa), nomeMesa: mesa.nome ?? null });
    setTimeout(() => irPara(ID_CARDAPIO), 0);
  }

  function abrirConta(mesa) {
    setAvisoMesas('');
    setContaAberta({ mesa: mesa.mesa, ids: mesa.pedidos.map((p) => p.id) });
  }

  function contaConcluida(texto) {
    setContaAberta(null);
    setAvisoMesas(texto);
    // A mesa que estava escolhida para o próximo pedido pode ter mudado.
    if (destino.tipo === 'mesa' && Number(destino.mesa) === contaAberta?.mesa) {
      mexerNoDestino({ tipo: 'mesa', mesa: '', nomeMesa: null });
    }
  }

  // tamanho: o botão do tamanho que tocaram (produto com tamanhos).
  // segundo: a outra metade, no meio a meio.
  function adicionar(produto, tamanho = null, segundo = null) {
    const tamanhoId = tamanho?.id ?? null;
    const segundoId = segundo?.id ?? null;
    mexerNoCarrinho((c) => {
      const semObservacao = c.find(
        (l) =>
          l.produtoId === produto.id &&
          (l.tamanhoId ?? null) === tamanhoId &&
          (l.segundoId ?? null) === segundoId &&
          !l.observacao.trim(),
      );
      if (semObservacao) {
        return c.map((l) => (l === semObservacao ? { ...l, quantidade: l.quantidade + 1 } : l));
      }
      return [
        ...c,
        {
          chave: novaChaveDeLinha(),
          produtoId: produto.id,
          tamanhoId,
          segundoId,
          nome: nomeDoItem(produto.nome, tamanho?.nome ?? null, segundo?.nome ?? null),
          quantidade: 1,
          observacao: '',
        },
      ];
    });
  }

  // Combo montado (ou só de partes fixas): soma no que já tem igual.
  function adicionarCombo(combo, escolhas) {
    const chave = chaveDoCombo(combo.id, escolhas);
    mexerNoCarrinho((c) => {
      const igual = c.find((l) => l.comboId && chaveDoCombo(l.comboId, l.escolhas) === chave && !l.observacao.trim());
      if (igual) return c.map((l) => (l === igual ? { ...l, quantidade: l.quantidade + 1 } : l));
      return [
        ...c,
        {
          chave: novaChaveDeLinha(),
          comboId: combo.id,
          escolhas,
          nome: combo.nome,
          detalhe: textoDasEscolhas(combo, escolhas, porId),
          quantidade: 1,
          observacao: '',
        },
      ];
    });
  }

  // Combo só de partes fixas: um toque adiciona. Com escolha: abre a janela.
  function tocarCombo(combo) {
    if (combo.partes.every(ehFixa)) adicionarCombo(combo, combo.partes.map((p) => escolhaDaOpcao(p.opcoes[0])));
    else setComboDe(combo);
  }

  // Tocou num combo que não sai: diz por quê e conta a venda evitada.
  function tocouComboEsgotado({ combo, esgotado, mudou }) {
    if (esgotado) {
      setAviso(
        `${combo.nome} está esgotado: acabou ${nomeComTamanho(esgotado.produto.nome, esgotado.tamanho?.nome)}. Ofereça outra opção ao cliente.`,
      );
      registrarToqueEsgotado(esgotado.produto.id);
    } else if (mudou) {
      setAviso(`${combo.nome} precisa ser revisto: um dos produtos dele saiu do cardápio. Peça para o dono editar o combo em Produtos.`);
    } else {
      setAviso(`${combo.nome} está esgotado. Ofereça outra opção ao cliente.`);
    }
  }

  // Tocou num esgotado: avisa e conta a venda que teria saído errada.
  function tocouEsgotado(produto, tamanho = null) {
    setAviso(`${nomeComTamanho(produto.nome, tamanho?.nome)} está esgotado. Ofereça outra opção ao cliente.`);
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
      setDestino(
        completo.mesa
          ? { tipo: 'mesa', mesa: String(completo.mesa), nomeMesa: completo.nome_mesa ?? null }
          : { tipo: 'balcao', mesa: '' },
      );
      setCarrinho(
        agruparItens(completo.itens).map((l) =>
          l.combo
            ? {
                chave: novaChaveDeLinha(),
                comboId: l.combo_id,
                escolhas: l.itens.map((i) => ({ produtoId: i.produto_id, tamanhoId: i.tamanho_id ?? null, segundoId: i.segundo_produto_id ?? null })),
                nome: l.nome,
                detalhe: l.itens.map((i) => i.nome).join(', '),
                quantidade: l.quantidade,
                observacao: l.observacao ?? '',
              }
            : {
                chave: novaChaveDeLinha(),
                produtoId: l.item.produto_id,
                tamanhoId: l.item.tamanho_id ?? null,
                segundoId: l.item.segundo_produto_id ?? null,
                nome: l.item.nome,
                quantidade: l.item.quantidade,
                observacao: l.item.observacao ?? '',
              },
        ),
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
    concluirEnvio();
  }

  function limparDetalhes() {
    setIdentificacao('');
    setForma(null);
    setErroPagamento('');
  }

  function escolherForma(nova) {
    setErroPagamento('');
    setForma(nova);
  }

  // O dono mudou o jeito de atender em outro aparelho: o pedido em montagem
  // não pode ficar num destino que este negócio não usa mais.
  // Na edição vale o destino que o pedido já tem.
  const destinoValido = Boolean(edicao) || (destino.tipo === 'mesa' ? atendeNaMesa(modo) : atendeNoBalcao(modo));
  const destinoAtual = destinoValido ? destino : inicial;
  const ehBalcao = destinoAtual.tipo === 'balcao';

  async function enviar() {
    if (!itens.length || enviando) return;
    if (itens.some(i=>i.excedenteIndisponivel)) {
      setErro('Um dos produtos esgotou. Revise o pedido.');
      return;
    }
    const mesa = destinoAtual.tipo === 'mesa' ? Number(destinoAtual.mesa) : null;
    const nomeMesa = mesa ? (destinoAtual.nomeMesa ?? null) : null;
    if (destinoAtual.tipo === 'mesa' && !(mesa >= 1 && mesa <= 999)) {
      if (mapaAtivo) {
        setErroMesa('Toque na mesa do pedido, no mapa das mesas.');
        irPara(ID_MAPA, 'button');
      } else {
        setErroMesa('Digite o número da mesa (de 1 a 999).');
        document.getElementById(ID_CAMPO_MESA)?.focus();
      }
      return;
    }
    // No balcão o cliente paga na hora: a forma é obrigatória. Na mesa, nada
    // se anota agora; a conta fecha quando o cliente vai embora.
    if (!edicao && ehBalcao && !forma) {
      setErroPagamento('Toque em como o cliente pagou.');
      document.getElementById(ID_PAGAMENTO)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      document.getElementById(ID_PAGAMENTO)?.querySelector('button')?.focus({ preventScroll: true });
      return;
    }
    const formaDoPedido = ehBalcao ? forma : null;
    const nomeDoCliente = ehBalcao ? identificacao : '';
    setErro('');
    setAviso('');
    setEnviando(true);
    const paraEnviar = itensDoCarrinho(itens);
    const linhas = itens.map(({ nome, quantidade, observacao }) => ({ nome, quantidade, observacao }));
    try {
      if (edicao) {
        await editarPedido(edicao.pedido.id, paraEnviar, edicao.pedido.alterado_em, mesa, nomeMesa);
        setEnviado({ ...edicao.pedido, editado: true, voltouAReceber: Boolean(edicao.pedido.pago_em) && valorMudou });
        setEdicao(null);
        setCarrinho(rascunhoGuardado);
        setDestino(destinoGuardado);
      } else {
        garantirChave();
        const pedido = await criarPedido({
          negocioId: perfil.negocio_id,
          usuarioId: perfil.id,
          itens: paraEnviar,
          chaveEnvio: chaveEnvio.current,
          mesa,
          nomeMesa,
          identificacao: nomeDoCliente,
          formaPagamento: formaDoPedido,
        });
        setCarrinho([]);
        limparDetalhes();
        concluirEnvio();
        // Próximo pedido: mesmo tipo (quem atende no salão segue de mesa em
        // mesa), com o número em branco para não ir para a mesa errada.
        setDestino((d) => ({ ...d, mesa: '', nomeMesa: null }));
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
          nomeMesa,
          identificacao: nomeDoCliente,
          formaPagamento: formaDoPedido,
          resumo: resumo(linhas),
        });
        setCarrinho([]);
        limparDetalhes();
        concluirEnvio();
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
  // Pedido já pago: mudar o valor desfaz o recebimento (mesma regra do banco).
  const pagoAntes = Boolean(edicao?.pedido.pago_em);
  const formaPaga = pagoAntes && ROTULO_FORMA[edicao.pedido.forma_pagamento];
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

      {diaResolver && (
        <ResolverPendencias
          pedidos={paraResolver}
          taxa={taxa}
          titulo="Para encerrar o dia, resolva:"
          descricao="Diga o que aconteceu com cada pedido. Quando a lista acabar, volte ao Caixa e encerre o dia."
          idTitulo="titulo-resolver"
          mostrarDia={!resolverHoje}
        />
      )}
      {resolvido && (
        <div aria-live="polite" className="mb-6 flex flex-col gap-2">
          <Aviso tipo="sucesso">Tudo resolvido. Agora dá para encerrar o dia.</Aviso>
          <Botao para={resolverHoje ? '/caixa' : '/caixa?dia=ontem'} cor="var(--color-accent-relatorios)" className="self-start">
            Ir para o Caixa e encerrar o dia
          </Botao>
        </div>
      )}
      {!diaResolver && pendentesAnteriores > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          <Aviso>
            Pendências do dia anterior: {pendentesAnteriores === 1 ? '1 pedido ficou' : `${quantosPedidos(pendentesAnteriores)} ficaram`} em
            aberto (sem entregar ou sem receber).
          </Aviso>
          <Botao para="/home#pendencias" variante="secundaria" className="self-start">
            Ver e resolver
          </Botao>
        </div>
      )}

      <FilaDeEnvio fila={filaDeEnvio} onTentar={tentarAgora} onTentarDeNovo={tentarDeNovo} onDescartar={descartar} />

      {mapaAtivo && produtos.length > 0 && <SugestaoDeMesas />}
      {mapaAtivo && produtos.length > 0 && (
        <MapaDeMesas
          mapa={mapa}
          escolhida={mesaEscolhida}
          onEscolherLivre={pedirNaMesa}
          onAbrirConta={abrirConta}
          sugestaoExtra={sugestaoExtra}
          onAbrirExtra={pedirNaMesa}
          aviso={avisoMesas && <Aviso tipo="sucesso">{avisoMesas}</Aviso>}
        />
      )}
      {mesaDaConta && (
        <ContaDaMesa
          key={mesaDaConta.mesa}
          mesa={mesaDaConta}
          mapa={mapa}
          taxa={taxa}
          onLancarMais={pedirNaMesa}
          onConcluido={contaConcluida}
          onFechar={() => setContaAberta(null)}
        />
      )}

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
          <div id={ID_CARDAPIO} className="scroll-mt-24 min-w-0">
          <GradeDeProdutos
            produtos={produtos}
            quantidadePorProduto={quantidadePorProduto}
            onAdicionar={adicionar}
            onEsgotado={tocouEsgotado}
            meioAMeio={aceitaMeioAMeio() && perfil.regra_meio_a_meio !== undefined}
            onMeioAMeio={setMeioDe}
            precoAgora={precoAgora}
            combos={combosDaGrade}
            onCombo={tocarCombo}
            onComboEsgotado={tocouComboEsgotado}
          />
          </div>
          {meioDe && (
            <EscolherMeioAMeio
              produto={porId[meioDe.id] ?? meioDe}
              produtos={produtos}
              regra={regraMeioAMeio}
              ehDono={perfil.papel === 'admin'}
              onEscolher={(tamanho, segundo) => {
                adicionar(porId[meioDe.id] ?? meioDe, tamanho, segundo);
                setMeioDe(null);
              }}
              onEsgotado={(produto, tamanho) => {
                tocouEsgotado(produto, tamanho);
                setMeioDe(null);
              }}
              onFechar={() => setMeioDe(null)}
              precoAgora={precoAgora}
            />
          )}
          {comboDe && comboPorId[comboDe.id] && (
            <EscolherCombo
              combo={comboPorId[comboDe.id]}
              porId={porId}
              precoBase={precoDoComboAgora(comboPorId[comboDe.id]).preco}
              onEscolher={(escolhas) => {
                adicionarCombo(comboPorId[comboDe.id], escolhas);
                setComboDe(null);
              }}
              onToqueEsgotado={(produto) => registrarToqueEsgotado(produto.id)}
              onFechar={() => setComboDe(null)}
            />
          )}

          <aside
            aria-labelledby="titulo-carrinho"
            className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 lg:sticky lg:top-24 flex flex-col gap-4"
            style={{ borderColor: edicao ? 'var(--color-brand-orange)' : 'var(--border-subtle)' }}
          >
            <h2 id="titulo-carrinho" className="text-lg font-semibold text-[var(--text-primary)]">
              {edicao ? `Pedido ${numeroEmEdicao}` : 'Pedido'}
            </h2>

            <DestinoDoPedido
              destino={destinoAtual}
              onMudar={mexerNoDestino}
              erroMesa={erroMesa}
              idCampoMesa={ID_CAMPO_MESA}
              escolhe={modo === 'balcao_e_mesa'}
              noMapa={mapaAtivo}
              onEscolherNoMapa={() => irPara(ID_MAPA, 'button')}
            />

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
            {pagoAntes && !edicaoPerdida && (
              <Aviso tipo="info">
                {!valorMudou
                  ? `Este pedido já foi pago${formaPaga ? ` (${formaPaga})` : ''}: ${formatarMoeda(totalPago)}. Se o valor mudar, ele volta para “A receber” no Caixa.`
                  : `O cliente pagou ${formatarMoeda(totalPago)}${formaPaga ? ` (${formaPaga})` : ''} e o pedido agora dá ${formatarMoeda(total)}. Ao salvar, ele volta para “A receber” no Caixa.`}
              </Aviso>
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
              {tamanhosMudaram.length > 0 && (
                <Aviso>
                  Os tamanhos de {tamanhosMudaram.join(', ')} mudaram no cardápio e {tamanhosMudaram.length === 1 ? 'ele saiu' : 'eles saíram'}{' '}
                  do pedido. Toque de novo no tamanho certo.
                </Aviso>
              )}
              {combosMudaram.length > 0 && (
                <Aviso>
                  {combosMudaram.join(', ')} {combosMudaram.length === 1 ? 'mudou' : 'mudaram'} no cardápio e{' '}
                  {combosMudaram.length === 1 ? 'saiu' : 'saíram'} do pedido. Adicione de novo.
                </Aviso>
              )}
              {meioMudou.length > 0 && (
                <Aviso>
                  {meioMudou.join(', ')} não {meioMudou.length === 1 ? 'pode' : 'podem'} mais ser meio a meio assim e{' '}
                  {meioMudou.length === 1 ? 'saiu' : 'saíram'} do pedido. Escolha os sabores de novo.
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

            {!edicao && itens.length > 0 && ehBalcao && (
              <DetalhesDoPedido
                identificacao={identificacao}
                onIdentificacao={setIdentificacao}
                forma={forma}
                onForma={escolherForma}
                erroPagamento={erroPagamento}
                idPagamento={ID_PAGAMENTO}
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
              {(erro || erroPagamento || erroMesa) && (
                <p className="text-sm font-semibold text-[var(--texto-cozinha)]" aria-hidden="true">
                  {erro || erroPagamento || erroMesa}
                </p>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs tabular-nums text-[var(--text-secondary)]">
                    {edicao ? `Pedido ${numeroEmEdicao}, ` : ''}
                    {destinoAtual.tipo === 'mesa' && destinoAtual.mesa
                      ? `${destinoDoPedido({ mesa: destinoAtual.mesa, nome_mesa: destinoAtual.nomeMesa })}, `
                      : ''}
                    {!edicao && ehBalcao && identificacao.trim() ? `${identificacao.trim()}, ` : ''}
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
