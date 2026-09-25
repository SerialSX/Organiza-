import { useState } from 'react';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Carregando from '../components/ui/Carregando';
import EstadoVazio from '../components/ui/EstadoVazio';
import { ProductsIcon, PlusIcon, PencilIcon, TrashIcon, CloseIcon } from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';
import { useProdutos } from '../hooks/useProdutos';
import { criarProduto, atualizarProduto, excluirProduto } from '../services/produtos';
import { formatarMoeda, lerValor, valorParaCampo } from '../lib/formatadores';

const ACCENT = 'var(--color-accent-produtos)';
const FORM_VAZIO = { nome: '', preco: '', custo: '' };

const campoClasse =
  'w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-primary)] px-4 py-3 text-base outline-none focus:border-[var(--color-accent-produtos)]';

function validar(form) {
  const nome = form.nome.trim();
  const preco = lerValor(form.preco);
  const custo = form.custo.trim() === '' ? null : lerValor(form.custo);

  if (!nome) return { erro: 'Digite o nome do produto.' };
  if (!Number.isFinite(preco) || preco <= 0) return { erro: 'Digite um preço de venda maior que zero.' };
  if (custo !== null && (!Number.isFinite(custo) || custo < 0)) return { erro: 'O custo precisa ser um valor válido.' };
  return { dados: { nome, preco: Math.round(preco * 100) / 100, custo: custo === null ? null : Math.round(custo * 100) / 100 } };
}

function FormularioProduto({ inicial, onSalvar, onCancelar }) {
  const [form, setForm] = useState(inicial);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const editando = Boolean(inicial.id);

  function alterar(campo) {
    return (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const { erro: invalido, dados } = validar(form);
    if (invalido) {
      setErro(invalido);
      return;
    }
    setSalvando(true);
    try {
      await onSalvar(dados);
    } catch (falha) {
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 sm:p-6 mb-6 flex flex-col gap-4"
      style={{ borderColor: ACCENT }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {editando ? 'Editar produto' : 'Novo produto'}
        </h2>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Fechar"
          className="w-10 h-10 inline-flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-card-hover)]"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {erro && <Aviso>{erro}</Aviso>}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--text-secondary)]">Nome</span>
        <input
          className={campoClasse}
          value={form.nome}
          onChange={alterar('nome')}
          placeholder="Ex.: X-Burguer"
          autoFocus
          maxLength={80}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--text-secondary)]">Preço de venda</span>
          <input
            className={campoClasse}
            value={form.preco}
            onChange={alterar('preco')}
            placeholder="R$ 0,00"
            inputMode="decimal"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--text-secondary)]">Custo (opcional)</span>
          <input
            className={campoClasse}
            value={form.custo}
            onChange={alterar('custo')}
            placeholder="R$ 0,00"
            inputMode="decimal"
          />
        </label>
      </div>
      <p className="text-xs text-[var(--text-secondary)] -mt-2">
        O custo serve para o relatório mostrar quanto você lucra com cada produto.
      </p>

      <button
        type="submit"
        disabled={salvando}
        className="w-full rounded-xl py-3.5 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        style={{ backgroundColor: ACCENT }}
      >
        {salvando ? 'Salvando...' : 'Salvar produto'}
      </button>
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
      className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition"
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
    <li
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:p-5 flex flex-col gap-4"
      style={{ opacity: produto.disponivel ? 1 : 0.7 }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-[var(--text-primary)] break-words">{produto.nome}</p>
          <p className="text-2xl font-bold" style={{ color: ACCENT }}>
            {formatarMoeda(produto.preco)}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {margem === null
              ? 'Sem custo cadastrado'
              : `Custo ${formatarMoeda(produto.custo)} · lucro ${formatarMoeda(margem)} por unidade`}
          </p>
        </div>
        {!produto.disponivel && (
          <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full text-white bg-[var(--color-accent-cozinha)]">
            Esgotado
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
        <Interruptor
          ligado={produto.disponivel}
          onChange={alternarDisponivel}
          rotulo={produto.disponivel ? `Marcar ${produto.nome} como esgotado` : `Marcar ${produto.nome} como disponível`}
        />
        <span className="text-sm font-medium text-[var(--text-secondary)] flex-1">
          {produto.disponivel ? 'Disponível' : 'Esgotado'}
        </span>

        {confirmando ? (
          <>
            <span className="text-sm text-[var(--text-primary)]">Excluir?</span>
            <button
              type="button"
              onClick={excluir}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--color-accent-cozinha)]"
            >
              Sim
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-[var(--text-primary)] border border-[var(--border-subtle)]"
            >
              Não
            </button>
          </>
        ) : (
          <>
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
              className="w-11 h-11 inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--color-accent-cozinha)] hover:bg-[var(--surface-card-hover)]"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export default function Produtos() {
  const { perfil } = useAuth();
  const { produtos, carregando, erro: erroCarga } = useProdutos();
  // null = fechado; objeto = formulário aberto (com id quando editando)
  const [formulario, setFormulario] = useState(null);
  const [erro, setErro] = useState('');

  async function salvar(dados) {
    if (formulario.id) await atualizarProduto(formulario.id, dados);
    else await criarProduto(perfil.negocio_id, dados);
    setFormulario(null);
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
            ? `${produtos.length} no cardápio · ${disponiveis} disponíveis`
            : 'Cadastre o que você vende'
        }
      >
        {!formulario && (
          <button
            type="button"
            onClick={() => {
              setErro('');
              setFormulario(FORM_VAZIO);
            }}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white transition hover:brightness-110"
            style={{ backgroundColor: ACCENT }}
          >
            <PlusIcon className="w-5 h-5" />
            Novo produto
          </button>
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
        <Carregando texto="Carregando produtos..." />
      ) : produtos.length === 0 ? (
        !formulario && (
          <EstadoVazio
            icon={ProductsIcon}
            accent={ACCENT}
            titulo="Nenhum produto ainda"
            texto="Cadastre os itens do seu cardápio para começar a lançar pedidos."
          >
            <button
              type="button"
              onClick={() => setFormulario(FORM_VAZIO)}
              className="mt-2 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              <PlusIcon className="w-5 h-5" />
              Cadastrar primeiro produto
            </button>
          </EstadoVazio>
        )
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {produtos.map((produto) => (
            <CartaoProduto
              key={produto.id}
              produto={produto}
              onEditar={() => abrirEdicao(produto)}
              onErro={setErro}
            />
          ))}
        </ul>
      )}
    </AppShell>
  );
}
