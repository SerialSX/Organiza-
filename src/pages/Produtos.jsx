import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Botao from '../components/ui/Botao';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import Etiqueta from '../components/ui/Etiqueta';
import Abas from '../components/ui/Abas';
import AbaIngredientes from '../components/produtos/AbaIngredientes';
import FormularioProduto from '../components/produtos/FormularioProduto';
import EscolhaDaRegraMeioAMeio from '../components/produtos/EscolhaDaRegraMeioAMeio';
import { FORM_VAZIO, listaNumerica } from '../lib/formularioProduto';
import ImportarCardapio from '../components/produtos/ImportarCardapio';
import ImportarPlanilha from '../components/produtos/ImportarPlanilha';
import { ProductsIcon, PlusIcon, PencilIcon, TrashIcon, BoxIcon, CameraIcon, SheetIcon, ComboIcon, TagIcon } from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';
import { useProdutos } from '../hooks/useProdutos';
import { useIngredientes } from '../hooks/useIngredientes';
import { useAbaNoEndereco } from '../hooks/useAbaNoEndereco';
import { salvarIngredientesDoProduto } from '../services/ingredientes';
import { CARDAPIOS_PRONTOS } from '../lib/cardapiosProntos';
import {
  criarProduto,
  criarProdutos,
  atualizarProduto,
  excluirProduto,
  listarProdutosArquivados,
  devolverAoCardapio,
  salvarTamanhosDoProduto,
  mudarDisponivelDoTamanho,
  aceitaTamanhos,
  aceitaMeioAMeio,
} from '../services/produtos';
import { formatarMoeda, valorParaCampo } from '../lib/formatadores';
import { algumTamanhoDisponivel, faixaDePreco, temTamanhos } from '../lib/tamanhos';
import Interruptor from '../components/ui/Interruptor';
import AbaCombos from '../components/produtos/AbaCombos';
import AbaPromocoes from '../components/produtos/AbaPromocoes';
import { useCombos } from '../hooks/useCombos';
import { aceitaCombos } from '../services/combos';

const ACCENT = 'var(--color-accent-produtos)';

const ABAS = [
  { id: 'produtos', rotulo: 'Produtos', Icone: ProductsIcon },
  { id: 'ingredientes', rotulo: 'Ingredientes', Icone: BoxIcon },
];
// Banco sem a migração 2026-11-15: as abas de combos e promoções não aparecem.
const ABAS_COM_COMBOS = [
  ...ABAS,
  { id: 'combos', rotulo: 'Combos', Icone: ComboIcon },
  { id: 'promocoes', rotulo: 'Promoções', Icone: TagIcon },
];

function mesmaLista(a, b) {
  const chave = (l) => l.map((i) => `${i.ingrediente_id}:${i.quantidade}`).sort().join('|');
  return chave(a) === chave(b);
}

// Quanto vai do ingrediente em cada tamanho. Se nenhum tamanho tem a
// quantidade (o produto ganhou tamanhos pela planilha), todos começam com a
// quantidade do produto, para o dono ajustar.
function quantidadesPorTamanho(produto, linha, texto) {
  const doTamanho = (t) => t.ingredientes.find((i) => i.ingrediente_id === linha.ingrediente_id)?.quantidade;
  const algum = produto.tamanhos.some((t) => doTamanho(t) !== undefined);
  return Object.fromEntries(produto.tamanhos.map((t) => [t.id, texto(algum ? doTamanho(t) : linha.quantidade)]));
}

// Para quem perguntou "quem cadastra o cardápio?": um toque e o cardápio
// está lá, com preços de exemplo para conferir.
function CardapioPronto({ negocioId, onPronto, onErro }) {
  const [salvando, setSalvando] = useState(null);

  async function usar(cardapio) {
    setSalvando(cardapio.id);
    try {
      await criarProdutos(negocioId, cardapio.produtos);
      onPronto();
    } catch (e) {
      onErro(e.message);
    }
    setSalvando(null);
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      <p className="text-sm font-semibold text-[var(--text-primary)]">Começar com um cardápio pronto:</p>
      <div className="flex flex-wrap justify-center gap-2">
        {CARDAPIOS_PRONTOS.filter((c) => !c.comTamanhos || aceitaTamanhos()).map((c) => (
          <Botao key={c.id} cor={ACCENT} onClick={() => usar(c)} disabled={Boolean(salvando)}>
            {salvando === c.id ? 'Cadastrando…' : c.nome}
          </Botao>
        ))}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">Os preços são de exemplo: confira e ajuste depois.</p>
    </div>
  );
}

// Um tamanho no cartão do produto: preço, lucro e o esgotado só dele.
function LinhaDoTamanho({ produto, tamanho, onErro }) {
  const sai = produto.disponivel && tamanho.disponivel;
  const lucro = tamanho.custo === null ? null : tamanho.preco - tamanho.custo;

  async function alternar() {
    try {
      await mudarDisponivelDoTamanho(tamanho.id, !tamanho.disponivel);
    } catch (e) {
      onErro(e.message);
    }
  }

  return (
    <li className="flex items-center gap-3">
      <span className="flex-1 min-w-0">
        <span
          className={`font-semibold tabular-nums ${sai ? 'text-[var(--text-primary)]' : 'line-through text-[var(--text-secondary)]'}`}
        >
          {tamanho.nome} · {formatarMoeda(tamanho.preco)}
        </span>
        <span className="block text-xs tabular-nums text-[var(--text-secondary)]">
          {!tamanho.disponivel ? 'Esgotado' : lucro === null ? 'Sem custo' : `Lucro de ${formatarMoeda(lucro)} cada`}
        </span>
      </span>
      <Interruptor
        ligado={tamanho.disponivel}
        onChange={alternar}
        disabled={!produto.disponivel}
        rotulo={`${produto.nome} ${tamanho.nome} disponível`}
      />
    </li>
  );
}

function CartaoProduto({ produto, pelosIngredientes, onEditar, onErro }) {
  const [confirmando, setConfirmando] = useState(false);
  const margem = produto.custo === null ? null : produto.preco - produto.custo;
  const comTamanhos = temTamanhos(produto);
  const sai = algumTamanhoDisponivel(produto);

  async function alternarDisponivel() {
    try {
      await atualizarProduto(produto.id, { disponivel: !produto.disponivel });
    } catch (e) {
      onErro(e.message);
    }
  }

  async function excluir() {
    try {
      await excluirProduto(produto.id);
    } catch (e) {
      setConfirmando(false);
      onErro(e.message);
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-[var(--text-primary)] break-words">{produto.nome}</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--texto-produtos)]">{faixaDePreco(produto)}</p>
          {!comTamanhos && (
            <p className="text-sm tabular-nums text-[var(--text-secondary)] mt-1">
              {margem === null
                ? 'Sem custo cadastrado'
                : `Custo ${formatarMoeda(produto.custo)}${pelosIngredientes ? ' (pelos ingredientes)' : ''}, lucro de ${formatarMoeda(margem)} cada`}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {!sai && <Etiqueta cor="var(--color-accent-cozinha)">Esgotado</Etiqueta>}
          {produto.vai_para_cozinha === false && <Etiqueta cor="var(--color-accent-pedidos)">Sem cozinha</Etiqueta>}
          {produto.meio_a_meio && <Etiqueta cor="var(--color-accent-produtos)">Meio a meio</Etiqueta>}
        </div>
      </div>

      {comTamanhos && (
        <ul className="flex flex-col gap-3" aria-label={`Tamanhos de ${produto.nome}`}>
          {produto.tamanhos.map((t) => (
            <LinhaDoTamanho key={t.id} produto={produto} tamanho={t} onErro={onErro} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
        <Interruptor
          ligado={produto.disponivel}
          onChange={alternarDisponivel}
          rotulo={comTamanhos ? `${produto.nome}, todos os tamanhos disponíveis` : `${produto.nome} disponível`}
        />
        <span className="text-sm font-medium text-[var(--text-secondary)] flex-1">
          {comTamanhos
            ? produto.disponivel
              ? 'Todos os tamanhos'
              : 'Esgotado (todos)'
            : produto.disponivel
              ? 'Disponível'
              : 'Esgotado'}
        </span>

        {confirmando ? (
          <div className="flex items-center gap-2" role="group" aria-label={`Excluir ${produto.nome}?`}>
            <span className="text-sm text-[var(--text-primary)]">Tirar do cardápio?</span>
            <Botao variante="perigo" onClick={excluir}>
              Sim
            </Botao>
            <Botao variante="secundaria" onClick={() => setConfirmando(false)}>
              Não
            </Botao>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEditar}
              aria-label={`Editar ${produto.nome}`}
              className="w-11 h-11 inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)]"
            >
              <PencilIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              aria-label={`Excluir ${produto.nome}`}
              className="w-11 h-11 inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--texto-cozinha)] hover:bg-[var(--surface-card-hover)]"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// Produto excluído some do cardápio, mas continua nos pedidos antigos. Se foi
// sem querer, dá para devolver.
function Excluidos({ atualizarCardapio, onErro }) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setLista(await listarProdutosArquivados());
    } catch (e) {
      onErro(e.message);
    }
  }, [onErro]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga vinda do banco ao abrir a lista
    if (aberto) carregar();
  }, [aberto, carregar]);

  async function devolver(produto) {
    try {
      await devolverAoCardapio(produto.id);
      await carregar();
      atualizarCardapio();
    } catch (e) {
      onErro(e.message);
    }
  }

  return (
    <section className="mt-10">
      <Botao variante="texto" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
        {aberto ? 'Esconder produtos excluídos' : 'Ver produtos excluídos'}
      </Botao>
      {aberto && (
        <div className="mt-3">
          {lista === null ? (
            <Carregando />
          ) : lista.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Nenhum produto excluído.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lista.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-subtle)] px-4 py-3"
                >
                  <span className="flex-1 min-w-0 font-medium text-[var(--text-primary)] break-words">{p.nome}</span>
                  <Botao variante="secundaria" onClick={() => devolver(p)}>
                    Devolver ao cardápio
                  </Botao>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// Sabores marcados como meio a meio (pelo cardápio pronto ou pela planilha)
// e o dono ainda não disse como cobra: sem isso, o pedido meio a meio não sai.
function FaltaRegraMeioAMeio() {
  const { configurarMeioAMeio } = useAuth();
  const [regra, setRegra] = useState(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    if (!regra) {
      setErro('Escolha como você cobra o meio a meio.');
      return;
    }
    setErro('');
    setSalvando(true);
    const { erro: falha } = await configurarMeioAMeio(regra);
    setSalvando(false);
    if (falha) setErro(falha);
  }

  return (
    <section
      aria-labelledby="titulo-falta-regra"
      className="rounded-2xl border-2 border-[var(--color-accent-produtos)] bg-[var(--surface-card)] p-5 mb-6 flex flex-col gap-4"
    >
      <div>
        <h2 id="titulo-falta-regra" className="text-lg font-semibold text-[var(--text-primary)]">
          Falta escolher como cobrar o meio a meio
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Alguns sabores podem ser meio a meio. Escolha uma vez e vale para todos (dá para mudar depois em Minha conta).
        </p>
      </div>
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <EscolhaDaRegraMeioAMeio valor={regra} onMudar={setRegra} erro={erro} legendaVisivel={false} />
        <Botao type="submit" cor={ACCENT} className="self-start" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </form>
    </section>
  );
}

export default function Produtos() {
  const { perfil, configurarMeioAMeio } = useAuth();
  const { produtos, carregando, erro: erroCarga, recarregar } = useProdutos();
  const ingredientes = useIngredientes();
  const combos = useCombos();
  const comCombos = aceitaCombos();
  const abas = comCombos ? ABAS_COM_COMBOS : ABAS;
  const [aba, setAba] = useAbaNoEndereco('aba', abas, 'produtos');
  // null = fechado; objeto = formulário aberto (com id quando editando)
  const [formulario, setFormulario] = useState(null);
  const [erro, setErro] = useState('');
  // false, 'foto' (cardápio pela IA) ou 'planilha'
  const [importando, setImportando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  // Produto novo que já foi criado, mas a lista de ingredientes falhou: a
  // próxima tentativa só atualiza, em vez de criar o produto de novo.
  const criado = useRef(null);
  // Tamanhos já criados numa tentativa que falhou depois (nos ingredientes):
  // tentar de novo atualiza esses, em vez de criar outros.
  const idsDosTamanhos = useRef({});

  const comPreco = new Set(ingredientes.ingredientes.filter((i) => i.preco_compra !== null).map((i) => i.id));

  async function salvar({ lista, tamanhos, regra_meio_a_meio: regra, ...dados }) {
    // Primeiro produto meio a meio: a regra escolhida no formulário vai antes.
    if (regra) {
      const { erro: falha } = await configurarMeioAMeio(regra);
      if (falha) throw new Error(falha);
    }
    let id = formulario.id ?? criado.current;
    if (id) await atualizarProduto(id, dados);
    else {
      id = (await criarProduto(perfil.negocio_id, dados)).id;
      criado.current = id;
    }
    const tinhaTamanhos = Boolean(formulario.comTamanhos);
    if (tamanhos) {
      const ids = idsDosTamanhos.current;
      const salvos = await salvarTamanhosDoProduto(
        id,
        tamanhos.map((t) => ({ ...t, id: t.id ?? ids[t.chave] ?? null })),
      );
      tamanhos.forEach((t, i) => {
        if (salvos[i]) ids[t.chave] = salvos[i].id;
      });
      const itens = lista.map((l) => ({
        ingrediente_id: l.ingrediente_id,
        por_tamanho: Object.fromEntries(
          Object.entries(l.porChave)
            .filter(([chave]) => ids[chave])
            .map(([chave, q]) => [ids[chave], q]),
        ),
      }));
      if (itens.length || formulario.lista.length) await salvarIngredientesDoProduto(id, itens);
    } else {
      // Desligou os tamanhos: eles vão para o arquivo (pedidos antigos ficam
      // como estão) e a lista de ingredientes volta a ser uma só.
      if (tinhaTamanhos) await salvarTamanhosDoProduto(id, []);
      if (tinhaTamanhos || !mesmaLista(lista, listaNumerica(formulario.lista))) await salvarIngredientesDoProduto(id, lista);
    }
    criado.current = null;
    idsDosTamanhos.current = {};
    setFormulario(null);
    recarregar();
  }

  function abrir(form) {
    setErro('');
    setMensagem('');
    setImportando(false);
    criado.current = null;
    idsDosTamanhos.current = {};
    setFormulario(form);
  }

  function abrirNovo() {
    abrir(FORM_VAZIO);
  }

  function abrirImportacao(jeito = 'foto') {
    setErro('');
    setMensagem('');
    setImportando(jeito);
  }

  function aoImportar(quantidade) {
    setImportando(false);
    setMensagem(quantidade === 1 ? '1 produto importado do cardápio.' : `${quantidade} produtos importados do cardápio.`);
    recarregar();
  }

  function aoImportarPlanilha({ criados, atualizados, repetidos }) {
    setImportando(false);
    const partes = [];
    if (criados) partes.push(criados === 1 ? '1 produto novo entrou no cardápio.' : `${criados} produtos novos entraram no cardápio.`);
    if (atualizados) partes.push(atualizados === 1 ? '1 produto foi atualizado.' : `${atualizados} produtos foram atualizados.`);
    if (repetidos) partes.push(repetidos === 1 ? '1 já estava no cardápio e não foi repetido.' : `${repetidos} já estavam no cardápio e não foram repetidos.`);
    setMensagem(partes.join(' ') || 'Nada mudou no cardápio.');
    recarregar();
  }

  function abrirEdicao(produto) {
    const texto = (q) => (q === undefined || q === null ? '' : String(q).replace('.', ','));
    const comTamanhos = temTamanhos(produto);
    abrir({
      id: produto.id,
      nome: produto.nome,
      preco: valorParaCampo(produto.preco),
      custo: valorParaCampo(produto.custo),
      vaiParaCozinha: produto.vai_para_cozinha !== false,
      meioAMeio: produto.meio_a_meio,
      regraMeioAMeio: null,
      comTamanhos,
      tamanhos: produto.tamanhos.map((t) => ({
        chave: t.id,
        id: t.id,
        nome: t.nome,
        preco: valorParaCampo(t.preco),
        custo: valorParaCampo(t.custo),
        disponivel: t.disponivel,
      })),
      lista: produto.ingredientes.map((l) => ({
        ingrediente_id: l.ingrediente_id,
        quantidade: texto(l.quantidade),
        ...(comTamanhos ? { por: quantidadesPorTamanho(produto, l, texto) } : {}),
      })),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const disponiveis = produtos.filter(algumTamanhoDisponivel).length;
  // undefined no perfil: banco sem a migração do meio a meio.
  const podeSerMeioAMeio = aceitaMeioAMeio() && perfil.regra_meio_a_meio !== undefined;
  const faltaRegra = podeSerMeioAMeio && perfil.regra_meio_a_meio === null && produtos.some((p) => p.meio_a_meio);

  return (
    <AppShell>
      <PageHeader
        icon={ProductsIcon}
        accent={ACCENT}
        title="Produtos"
        subtitle={
          produtos.length
            ? `${produtos.length} no cardápio, ${disponiveis} ${disponiveis === 1 ? 'disponível' : 'disponíveis'}`
            : 'Cadastre o que você vende'
        }
      >
        {aba === 'produtos' && !formulario && !importando && produtos.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <Botao variante="secundaria" tamanho="grande" onClick={() => abrirImportacao('foto')}>
              <CameraIcon className="w-5 h-5" />
              Importar do cardápio
            </Botao>
            <Botao variante="secundaria" tamanho="grande" onClick={() => abrirImportacao('planilha')}>
              <SheetIcon className="w-5 h-5" />
              Importar planilha
            </Botao>
            <Botao cor={ACCENT} tamanho="grande" onClick={abrirNovo}>
              <PlusIcon className="w-5 h-5" />
              Novo produto
            </Botao>
          </div>
        )}
      </PageHeader>

      <div className="mb-6">
        <Abas opcoes={abas} valor={aba} onMudar={setAba} cor={ACCENT} rotulo="O que mostrar" />
      </div>

      {/* As duas abas ficam montadas: ir cadastrar um ingrediente no meio de um
          produto não apaga o que já foi digitado. */}
      <div hidden={aba !== 'ingredientes'}>
        <AbaIngredientes
          {...ingredientes}
          erroCarga={ingredientes.erro}
          produtos={produtos}
          negocioId={perfil.negocio_id}
        />
        {formulario && (
          <Botao variante="secundaria" className="mt-6" onClick={() => setAba('produtos')}>
            Voltar para o produto que você estava cadastrando
          </Botao>
        )}
      </div>

      {comCombos && aba === 'combos' && (
        <AbaCombos
          combos={combos.combos}
          carregando={combos.carregando || carregando}
          erroCarga={combos.erro}
          produtos={produtos}
          recarregar={combos.recarregar}
        />
      )}
      {comCombos && aba === 'promocoes' && (
        <AbaPromocoes
          promocoes={combos.promocoes}
          combos={combos.combos}
          carregando={combos.carregando || carregando}
          erroCarga={combos.erro}
          produtos={produtos}
          recarregar={combos.recarregar}
        />
      )}

      <div hidden={aba !== 'produtos'}>
        {importando === 'planilha' && (
          <ImportarPlanilha
            produtos={produtos}
            negocioId={perfil.negocio_id}
            onFechar={() => setImportando(false)}
            onImportado={aoImportarPlanilha}
          />
        )}

        {importando === 'foto' && (
          <ImportarCardapio
            produtos={produtos}
            negocioId={perfil.negocio_id}
            onFechar={() => setImportando(false)}
            onImportado={aoImportar}
          />
        )}

        {formulario && (
          <FormularioProduto
            key={formulario.id ?? 'novo'}
            inicial={formulario}
            ingredientes={ingredientes.ingredientes}
            podeTerTamanhos={aceitaTamanhos()}
            podeSerMeioAMeio={podeSerMeioAMeio}
            regraMeioAMeio={perfil.regra_meio_a_meio ?? null}
            onSalvar={salvar}
            onCancelar={() => setFormulario(null)}
            onIrParaIngredientes={() => setAba('ingredientes')}
          />
        )}

        {faltaRegra && !formulario && perfil.papel === 'admin' && <FaltaRegraMeioAMeio />}

        {(erro || erroCarga) && <Aviso className="mb-4">{erro || erroCarga}</Aviso>}
        {mensagem && (
          <Aviso tipo="sucesso" className="mb-4">
            {mensagem}
          </Aviso>
        )}

        {carregando ? (
          <Carregando texto="Carregando produtos…" />
        ) : produtos.length === 0 ? (
          !formulario &&
          !importando && (
            <EstadoVazio
              icon={ProductsIcon}
              accent={ACCENT}
              titulo="Nenhum produto ainda"
              texto="Comece com um cardápio pronto e só ajuste os preços, importe a sua planilha ou cadastre um por um."
            >
              <CardapioPronto negocioId={perfil.negocio_id} onPronto={recarregar} onErro={setErro} />
              <Botao variante="secundaria" tamanho="grande" onClick={abrirNovo} className="mt-2">
                <PlusIcon className="w-5 h-5" />
                Cadastrar o primeiro produto
              </Botao>
              <Botao variante="secundaria" tamanho="grande" onClick={() => abrirImportacao('planilha')} className="mt-2">
                <SheetIcon className="w-5 h-5" />
                Importar planilha
              </Botao>
              <Botao variante="secundaria" tamanho="grande" onClick={() => abrirImportacao('foto')} className="mt-2">
                <CameraIcon className="w-5 h-5" />
                Importar do cardápio
              </Botao>
            </EstadoVazio>
          )
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {produtos.map((produto) => (
              <CartaoProduto
                key={produto.id}
                produto={produto}
                pelosIngredientes={produto.ingredientes.some((l) => comPreco.has(l.ingrediente_id))}
                onEditar={() => abrirEdicao(produto)}
                onErro={setErro}
              />
            ))}
          </ul>
        )}

        {!carregando && <Excluidos atualizarCardapio={recarregar} onErro={setErro} />}
      </div>
    </AppShell>
  );
}
