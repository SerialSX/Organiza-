import { useCallback, useEffect, useState } from 'react';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Botao from '../components/ui/Botao';
import Campo from '../components/ui/Campo';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import Etiqueta from '../components/ui/Etiqueta';
import { ProductsIcon, PlusIcon, PencilIcon, TrashIcon, CloseIcon } from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';
import { useProdutos } from '../hooks/useProdutos';
import {
  criarProduto,
  atualizarProduto,
  excluirProduto,
  listarProdutosArquivados,
  devolverAoCardapio,
} from '../services/produtos';
import { formatarMoeda, lerValor, valorParaCampo } from '../lib/formatadores';

const ACCENT = 'var(--color-accent-produtos)';
const FORM_VAZIO = { nome: '', preco: '', custo: '' };

function validar(form) {
  const erros = {};
  const nome = form.nome.trim();
  const preco = lerValor(form.preco);
  const custo = form.custo.trim() === '' ? null : lerValor(form.custo);

  if (!nome) erros.nome = 'Digite o nome do produto.';
  if (!Number.isFinite(preco) || preco <= 0) erros.preco = 'Digite um preço maior que zero, como 12,50.';
  if (custo !== null && (!Number.isFinite(custo) || custo < 0)) erros.custo = 'Digite um valor como 6,00 ou deixe em branco.';
  if (Object.keys(erros).length) return { erros };
  return {
    dados: { nome, preco: Math.round(preco * 100) / 100, custo: custo === null ? null : Math.round(custo * 100) / 100 },
  };
}

function FormularioProduto({ inicial, onSalvar, onCancelar }) {
  const [form, setForm] = useState(inicial);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [salvando, setSalvando] = useState(false);
  const editando = Boolean(inicial.id);

  function alterar(campo) {
    return (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const { erros: invalidos, dados } = validar(form);
    if (invalidos) {
      setErros(invalidos);
      e.currentTarget.elements.namedItem(Object.keys(invalidos)[0])?.focus();
      return;
    }
    setErros({});
    setErroGeral('');
    setSalvando(true);
    try {
      await onSalvar(dados);
    } catch (falha) {
      setErroGeral(falha.message);
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="titulo-formulario-produto"
      className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 sm:p-6 mb-6 flex flex-col gap-4"
      style={{ borderColor: ACCENT }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-formulario-produto" className="text-lg font-semibold text-[var(--text-primary)]">
          {editando ? 'Editar produto' : 'Novo produto'}
        </h2>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Fechar sem salvar"
          className="w-11 h-11 inline-flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-card-hover)]"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {erroGeral && <Aviso>{erroGeral}</Aviso>}

      <Campo
        rotulo="Nome"
        name="nome"
        value={form.nome}
        onChange={alterar('nome')}
        placeholder="Ex.: X-Burguer"
        autoComplete="off"
        autoFocus
        maxLength={120}
        erro={erros.nome}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Campo
          rotulo="Preço de venda (R$)"
          name="preco"
          value={form.preco}
          onChange={alterar('preco')}
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
          erro={erros.preco}
        />
        <Campo
          rotulo="Custo (R$, opcional)"
          name="custo"
          value={form.custo}
          onChange={alterar('custo')}
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
          erro={erros.custo}
          dica="Com o custo, o relatório mostra quanto você lucra com cada produto."
        />
      </div>

      <Botao type="submit" tamanho="grande" cor={ACCENT} larguraTotal disabled={salvando}>
        {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar produto'}
      </Botao>
    </form>
  );
}

function Interruptor({ ligado, onChange, rotulo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={onChange}
      className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors"
      style={{ backgroundColor: ligado ? 'var(--color-accent-relatorios)' : 'var(--border-subtle)' }}
    >
      <span
        className="inline-block h-6 w-6 rounded-full bg-white shadow transition-transform"
        style={{ transform: ligado ? 'translateX(28px)' : 'translateX(4px)' }}
      />
    </button>
  );
}

function CartaoProduto({ produto, onEditar, onErro }) {
  const [confirmando, setConfirmando] = useState(false);
  const margem = produto.custo === null ? null : produto.preco - produto.custo;

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
          <p className="text-2xl font-bold tabular-nums text-[var(--texto-produtos)]">{formatarMoeda(produto.preco)}</p>
          <p className="text-sm tabular-nums text-[var(--text-secondary)] mt-1">
            {margem === null
              ? 'Sem custo cadastrado'
              : `Custo ${formatarMoeda(produto.custo)}, lucro de ${formatarMoeda(margem)} cada`}
          </p>
        </div>
        {!produto.disponivel && <Etiqueta cor="var(--color-accent-cozinha)">Esgotado</Etiqueta>}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
        <Interruptor
          ligado={produto.disponivel}
          onChange={alternarDisponivel}
          rotulo={`${produto.nome} disponível`}
        />
        <span className="text-sm font-medium text-[var(--text-secondary)] flex-1">
          {produto.disponivel ? 'Disponível' : 'Esgotado'}
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

export default function Produtos() {
  const { perfil } = useAuth();
  const { produtos, carregando, erro: erroCarga, recarregar } = useProdutos();
  // null = fechado; objeto = formulário aberto (com id quando editando)
  const [formulario, setFormulario] = useState(null);
  const [erro, setErro] = useState('');

  async function salvar(dados) {
    if (formulario.id) await atualizarProduto(formulario.id, dados);
    else await criarProduto(perfil.negocio_id, dados);
    setFormulario(null);
  }

  function abrirNovo() {
    setErro('');
    setFormulario(FORM_VAZIO);
  }

  function abrirEdicao(produto) {
    setErro('');
    setFormulario({
      id: produto.id,
      nome: produto.nome,
      preco: valorParaCampo(produto.preco),
      custo: valorParaCampo(produto.custo),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const disponiveis = produtos.filter((p) => p.disponivel).length;

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
        {!formulario && produtos.length > 0 && (
          <Botao cor={ACCENT} tamanho="grande" onClick={abrirNovo}>
            <PlusIcon className="w-5 h-5" />
            Novo produto
          </Botao>
        )}
      </PageHeader>

      {formulario && (
        <FormularioProduto
          key={formulario.id ?? 'novo'}
          inicial={formulario}
          onSalvar={salvar}
          onCancelar={() => setFormulario(null)}
        />
      )}

      {(erro || erroCarga) && <Aviso className="mb-4">{erro || erroCarga}</Aviso>}

      {carregando ? (
        <Carregando texto="Carregando produtos…" />
      ) : produtos.length === 0 ? (
        !formulario && (
          <EstadoVazio
            icon={ProductsIcon}
            accent={ACCENT}
            titulo="Nenhum produto ainda"
            texto="Cadastre os itens do seu cardápio para começar a lançar pedidos."
          >
            <Botao cor={ACCENT} tamanho="grande" onClick={abrirNovo} className="mt-2">
              <PlusIcon className="w-5 h-5" />
              Cadastrar o primeiro produto
            </Botao>
          </EstadoVazio>
        )
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {produtos.map((produto) => (
            <CartaoProduto key={produto.id} produto={produto} onEditar={() => abrirEdicao(produto)} onErro={setErro} />
          ))}
        </ul>
      )}

      {!carregando && <Excluidos atualizarCardapio={recarregar} onErro={setErro} />}
    </AppShell>
  );
}
