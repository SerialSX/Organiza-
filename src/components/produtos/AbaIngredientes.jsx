import { useId, useState } from 'react';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import Campo, { classeCampo } from '../ui/Campo';
import Carregando from '../ui/Carregando';
import EstadoVazio from '../ui/EstadoVazio';
import { BoxIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from '../icons/AppIcons';
import { UNIDADES_DE_COMPRA, compraParaBanco, compraParaCampos, descreverCompra } from '../../lib/custos';
import { lerValor, valorParaCampo } from '../../lib/formatadores';
import { atualizarIngrediente, criarIngrediente, excluirIngrediente } from '../../services/ingredientes';

const ACCENT = 'var(--color-accent-produtos)';
const FORM_VAZIO = { nome: '', preco: '', quantidade: '1', unidadeCompra: 'kg' };

function validar(form) {
  const erros = {};
  const nome = form.nome.trim();
  const preco = form.preco.trim() === '' ? null : lerValor(form.preco);
  const quantidade = lerValor(form.quantidade);

  if (!nome) erros.nome = 'Digite o nome do ingrediente.';
  if (preco !== null && (!Number.isFinite(preco) || preco < 0 || preco > 99999.99)) erros.preco = 'Digite um valor como 45,00 ou deixe em branco.';
  if (preco !== null && !(quantidade > 0)) erros.quantidade = 'Diga quanto vem por esse preço, como 1 (kg) ou 12 (un).';
  if (Object.keys(erros).length) return { erros };

  const dados = { nome, ...compraParaBanco({ preco, quantidade, unidadeCompra: form.unidadeCompra }) };
  if (dados.quantidade_compra !== null && !(dados.quantidade_compra >= 1 && dados.quantidade_compra <= 1000000)) {
    return { erros: { quantidade: 'Use uma quantidade entre 1 g (ou ml, ou un) e 1.000 kg.' } };
  }
  return { dados };
}

function FormularioIngrediente({ inicial, emUso, onSalvo, onCancelar, negocioId }) {
  const [form, setForm] = useState(inicial);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [salvando, setSalvando] = useState(false);
  const idUnidade = useId();
  const editando = Boolean(inicial.id);
  // Trocar g por un num ingrediente que já está em produtos mudaria o sentido
  // das quantidades ("120 g" viraria "120 un").
  const unidadeTravada = editando && emUso.length > 0;

  function alterar(campo) {
    return (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  }

  async function salvar(e) {
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
      if (editando) await atualizarIngrediente(inicial.id, dados);
      else await criarIngrediente(negocioId, dados);
      const mudouPreco =
        editando && (dados.preco_compra !== inicial.original.preco_compra || dados.quantidade_compra !== inicial.original.quantidade_compra);
      onSalvo(mudouPreco && emUso.length ? emUso : null);
    } catch (falha) {
      setErroGeral(falha.message);
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={salvar}
      noValidate
      aria-labelledby="titulo-formulario-ingrediente"
      className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 sm:p-6 mb-6 flex flex-col gap-4"
      style={{ borderColor: ACCENT }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-formulario-ingrediente" className="text-lg font-semibold text-[var(--text-primary)]">
          {editando ? 'Editar ingrediente' : 'Novo ingrediente'}
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
        placeholder="Ex.: Queijo mussarela, Pão, Embalagem"
        autoComplete="off"
        autoFocus
        maxLength={60}
        erro={erros.nome}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Campo
          rotulo="Quanto você paga (R$, opcional)"
          name="preco"
          value={form.preco}
          onChange={alterar('preco')}
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
          erro={erros.preco}
        />
        <Campo
          rotulo="Por quanto"
          name="quantidade"
          value={form.quantidade}
          onChange={alterar('quantidade')}
          inputMode="decimal"
          autoComplete="off"
          erro={erros.quantidade}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idUnidade} className="text-sm font-medium text-[var(--text-secondary)]">
            Unidade
          </label>
          <select
            id={idUnidade}
            name="unidadeCompra"
            value={form.unidadeCompra}
            onChange={alterar('unidadeCompra')}
            className={classeCampo}
            aria-describedby={unidadeTravada ? `${idUnidade}-dica` : undefined}
          >
            {UNIDADES_DE_COMPRA.filter((u) => !unidadeTravada || u.base === inicial.original.unidade).map((u) => (
              <option key={u.id} value={u.id}>
                {u.id}
              </option>
            ))}
          </select>
          {unidadeTravada && (
            <p id={`${idUnidade}-dica`} className="text-xs text-[var(--text-secondary)]">
              Está em produtos, então só dá para trocar entre medidas do mesmo tipo.
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-[var(--text-secondary)] -mt-1">
        Ex.: R$ 45,00 por 1 kg de queijo, R$ 12,00 por 12 pães. Sem preço, o ingrediente serve só para a cozinha avisar
        quando faltar.
      </p>

      <Botao type="submit" tamanho="grande" cor={ACCENT} larguraTotal disabled={salvando}>
        {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar ingrediente'}
      </Botao>
    </form>
  );
}

function CartaoIngrediente({ ingrediente, emUso, onEditar, onErro }) {
  const [confirmando, setConfirmando] = useState(false);

  async function excluir() {
    try {
      await excluirIngrediente(ingrediente.id);
    } catch (e) {
      setConfirmando(false);
      onErro(e.message);
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 flex flex-col gap-3">
      <div>
        <p className="text-lg font-semibold text-[var(--text-primary)] break-words">{ingrediente.nome}</p>
        <p className="text-sm font-semibold tabular-nums text-[var(--texto-produtos)]">{descreverCompra(ingrediente)}</p>
        <p className="text-sm text-[var(--text-secondary)] mt-1 break-words">
          {emUso.length ? `Em: ${emUso.join(', ')}` : 'Ainda não está em nenhum produto'}
        </p>
      </div>
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Excluir ${ingrediente.nome}?`}>
          <span className="text-sm text-[var(--text-primary)]">
            {emUso.length ? `Sai de ${emUso.length === 1 ? '1 produto' : `${emUso.length} produtos`}. Excluir?` : 'Excluir?'}
          </span>
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
            aria-label={`Editar ${ingrediente.nome}`}
            className="w-11 h-11 inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)]"
          >
            <PencilIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            aria-label={`Excluir ${ingrediente.nome}`}
            className="w-11 h-11 inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--texto-cozinha)] hover:bg-[var(--surface-card-hover)]"
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      )}
    </li>
  );
}

export default function AbaIngredientes({ ingredientes, carregando, erroCarga, produtos, negocioId, recarregar }) {
  const [formulario, setFormulario] = useState(null);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');

  const usoPorIngrediente = {};
  for (const p of produtos) {
    for (const { ingrediente_id: id } of p.ingredientes) (usoPorIngrediente[id] ??= []).push(p.nome);
  }

  function abrirNovo() {
    setErro('');
    setMensagem('');
    setFormulario(FORM_VAZIO);
  }

  function abrirEdicao(ingrediente) {
    setErro('');
    setMensagem('');
    setFormulario({
      id: ingrediente.id,
      nome: ingrediente.nome,
      preco: valorParaCampo(ingrediente.preco_compra),
      ...compraParaCampos(ingrediente),
      original: ingrediente,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function aoSalvar(produtosAtualizados) {
    setFormulario(null);
    recarregar();
    if (produtosAtualizados) {
      setMensagem(`Custo atualizado em: ${produtosAtualizados.join(', ')}.`);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <p className="flex-1 min-w-60 text-sm text-[var(--text-secondary)]">
          O que você compra para fazer os produtos, embalagem também. Mudou o preço? Atualize aqui e o custo dos produtos
          muda junto.
        </p>
        {!formulario && ingredientes.length > 0 && (
          <Botao cor={ACCENT} onClick={abrirNovo}>
            <PlusIcon className="w-5 h-5" />
            Novo ingrediente
          </Botao>
        )}
      </div>

      {formulario && (
        <FormularioIngrediente
          key={formulario.id ?? 'novo'}
          inicial={formulario}
          emUso={formulario.id ? (usoPorIngrediente[formulario.id] ?? []) : []}
          negocioId={negocioId}
          onSalvo={aoSalvar}
          onCancelar={() => setFormulario(null)}
        />
      )}

      {mensagem && (
        <Aviso tipo="sucesso" className="mb-4">
          {mensagem}
        </Aviso>
      )}
      {(erro || erroCarga) && <Aviso className="mb-4">{erro || erroCarga}</Aviso>}

      {carregando ? (
        <Carregando texto="Carregando ingredientes…" />
      ) : ingredientes.length === 0 ? (
        !formulario && (
          <EstadoVazio
            icon={BoxIcon}
            accent={ACCENT}
            titulo="Nenhum ingrediente ainda"
            texto="Cadastre o que você compra e quanto paga. O custo de cada produto sai sozinho."
          >
            <Botao cor={ACCENT} tamanho="grande" onClick={abrirNovo} className="mt-2">
              <PlusIcon className="w-5 h-5" />
              Cadastrar o primeiro ingrediente
            </Botao>
          </EstadoVazio>
        )
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ingredientes.map((i) => (
            <CartaoIngrediente
              key={i.id}
              ingrediente={i}
              emUso={usoPorIngrediente[i.id] ?? []}
              onEditar={() => abrirEdicao(i)}
              onErro={setErro}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
