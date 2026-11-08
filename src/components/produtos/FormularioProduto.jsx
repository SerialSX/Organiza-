import { useState } from 'react';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import Campo from '../ui/Campo';
import IngredientesDoProduto from './IngredientesDoProduto';
import TamanhosDoProduto from './TamanhosDoProduto';
import { CloseIcon } from '../icons/AppIcons';
import { estimarCusto } from '../../lib/custos';
import EscolhaDaRegraMeioAMeio from './EscolhaDaRegraMeioAMeio';
import { formatarMoeda, lerValor } from '../../lib/formatadores';
import {
  comTamanhosDesligados,
  comTamanhosLigados,
  custoDigitado,
  custosDosTamanhos,
  listaNumerica,
  validarProduto,
} from '../../lib/formularioProduto';

const ACCENT = 'var(--color-accent-produtos)';
function Lucro({ preco, custo, rotulo = '' }) {
  const venda = lerValor(preco);
  if (custo === null || custo === undefined || !(venda > 0)) return null;
  const lucro = venda - custo;
  return (
    <p className="text-sm font-semibold tabular-nums" style={{ color: lucro >= 0 ? 'var(--texto-relatorios)' : 'var(--texto-cozinha)' }}>
      {rotulo}
      {lucro >= 0
        ? `Lucro de ${formatarMoeda(lucro)} por unidade (${Math.round((lucro / venda) * 100)}% do preço)`
        : `Prejuízo de ${formatarMoeda(-lucro)} por unidade: o custo passou do preço de venda`}
    </p>
  );
}

// podeTerTamanhos / podeSerMeioAMeio: false quando o banco ainda não tem a
// migração. regraMeioAMeio: a do negócio; null quando o dono ainda não
// escolheu (a escolha é pedida aqui, ao marcar o primeiro produto).
export default function FormularioProduto({
  inicial,
  ingredientes,
  podeTerTamanhos,
  podeSerMeioAMeio = false,
  regraMeioAMeio = null,
  onSalvar,
  onCancelar,
  onIrParaIngredientes,
}) {
  const [form, setForm] = useState(inicial);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [salvando, setSalvando] = useState(false);
  // Desligou os tamanhos de um produto que tinha: o preço único é pedido de novo.
  const [desligouTamanhos, setDesligouTamanhos] = useState(false);
  const editando = Boolean(inicial.id);
  const porId = Object.fromEntries(ingredientes.map((i) => [i.id, i]));

  const linhasValidas = listaNumerica(form.lista).filter((l) => l.quantidade > 0);
  const { total: estimado, semPreco } = form.comTamanhos
    ? { total: null, semPreco: [] }
    : estimarCusto(linhasValidas, porId);
  const custoAtual = estimado ?? custoDigitado(form.custo);
  const estimadosDosTamanhos = form.comTamanhos ? custosDosTamanhos(form, porId) : {};
  const semPrecoNosTamanhos = form.comTamanhos
    ? [...new Set(form.lista.filter((l) => porId[l.ingrediente_id]?.preco_compra === null).map((l) => porId[l.ingrediente_id].nome))]
    : [];
  const algumEstimado = Object.values(estimadosDosTamanhos).some((v) => v !== null);

  function alterar(campo) {
    return (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  }

  function ligarTamanhos(ligar) {
    setErros({});
    const jaTinha = Boolean(editando && inicial.comTamanhos);
    setDesligouTamanhos(!ligar && jaTinha);
    setForm((f) => (ligar ? comTamanhosLigados(f) : comTamanhosDesligados(f, jaTinha)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validado = validarProduto(form, porId);
    const pedirRegra = form.meioAMeio && !regraMeioAMeio;
    const invalidos =
      pedirRegra && !form.regraMeioAMeio
        ? { ...validado.erros, regraMeioAMeio: 'Escolha como você cobra o meio a meio.' }
        : validado.erros;
    const dados = validado.dados && { ...validado.dados, regra_meio_a_meio: pedirRegra ? form.regraMeioAMeio : null };
    if (invalidos) {
      setErros(invalidos);
      const campo = e.currentTarget.elements.namedItem(Object.keys(invalidos)[0]);
      (campo?.focus ? campo : campo?.[0])?.focus();
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

      {(podeTerTamanhos || form.comTamanhos) && (
        <label className="flex items-start gap-3 rounded-xl border border-[var(--border-subtle)] p-4 cursor-pointer">
          <input
            type="checkbox"
            name="comTamanhos"
            checked={form.comTamanhos}
            onChange={(e) => ligarTamanhos(e.target.checked)}
            className="mt-0.5 w-5 h-5 shrink-0"
          />
          <span>
            <span className="block font-semibold text-[var(--text-primary)]">Tem tamanhos?</span>
            <span className="block text-sm text-[var(--text-secondary)]">
              Marque quando o mesmo produto sai em tamanhos com preços diferentes, como pizza P, M e G ou açaí de 300 ml e 500 ml.
            </span>
          </span>
        </label>
      )}

      {form.comTamanhos ? (
        <TamanhosDoProduto
          tamanhos={form.tamanhos}
          onMudar={(tamanhos) => setForm((f) => ({ ...f, tamanhos }))}
          estimados={estimadosDosTamanhos}
          erros={erros}
          nomeProduto={form.nome}
        />
      ) : (
        <>
          {desligouTamanhos && (
            <Aviso tipo="info">
              Sem tamanhos, o produto passa a ter um preço só. Digite o preço abaixo. Os pedidos que já foram feitos continuam com o
              tamanho e o preço de quando foram lançados.
            </Aviso>
          )}
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
            {estimado === null ? (
              <Campo
                rotulo="Custo (R$, opcional)"
                name="custo"
                value={form.custo}
                onChange={alterar('custo')}
                placeholder="0,00"
                inputMode="decimal"
                autoComplete="off"
                erro={erros.custo}
                dica="Digite o custo ou adicione os ingredientes abaixo para calcular."
              />
            ) : (
              <div className="flex flex-col gap-1.5" aria-live="polite">
                <span className="text-sm font-medium text-[var(--text-secondary)]">Custo estimado</span>
                <p className="min-h-12 flex items-center text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {formatarMoeda(estimado)}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Calculado pelos ingredientes. Muda sozinho quando o preço de um ingrediente muda.
                </p>
              </div>
            )}
          </div>

          <Lucro preco={form.preco} custo={custoAtual} />
        </>
      )}

      {(podeSerMeioAMeio || form.meioAMeio) && (
        <div className="rounded-xl border border-[var(--border-subtle)]">
          <label className="flex items-start gap-3 p-4 cursor-pointer">
            <input
              type="checkbox"
              name="meioAMeio"
              checked={form.meioAMeio}
              onChange={(e) => setForm((f) => ({ ...f, meioAMeio: e.target.checked }))}
              className="mt-0.5 w-5 h-5 shrink-0"
            />
            <span>
              <span className="block font-semibold text-[var(--text-primary)]">Pode ser meio a meio</span>
              <span className="block text-sm text-[var(--text-secondary)]">
                Marque nos sabores que podem ir juntos, como as pizzas. No pedido, junta dois sabores marcados do mesmo tamanho (G com G).
              </span>
            </span>
          </label>
          {form.meioAMeio && !regraMeioAMeio && (
            <div className="border-t border-[var(--border-subtle)] p-4">
              <EscolhaDaRegraMeioAMeio
                valor={form.regraMeioAMeio}
                onMudar={(regra) => setForm((f) => ({ ...f, regraMeioAMeio: regra }))}
                erro={erros.regraMeioAMeio}
                texto="Vale para todos os sabores. Dá para mudar depois em Minha conta."
              />
            </div>
          )}
        </div>
      )}

      <label className="flex items-start gap-3 rounded-xl border border-[var(--border-subtle)] p-4 cursor-pointer">
        <input
          type="checkbox"
          name="vaiParaCozinha"
          checked={form.vaiParaCozinha !== false}
          onChange={(e) => setForm((f) => ({ ...f, vaiParaCozinha: e.target.checked }))}
          className="mt-0.5 w-5 h-5 shrink-0"
        />
        <span>
          <span className="block font-semibold text-[var(--text-primary)]">Vai para a cozinha</span>
          <span className="block text-sm text-[var(--text-secondary)]">
            Desmarque para bebida e o que já sai pronto: entra na conta e no caixa, mas não aparece na fila da cozinha.
          </span>
        </span>
      </label>

      <IngredientesDoProduto
        lista={form.lista}
        onMudar={(lista) => setForm((f) => ({ ...f, lista }))}
        ingredientes={ingredientes}
        erro={erros.lista}
        onIrParaIngredientes={onIrParaIngredientes}
        nomeProduto={form.nome}
        tamanhos={form.comTamanhos ? form.tamanhos : null}
      />

      {((estimado !== null && semPreco.length > 0) || (algumEstimado && semPrecoNosTamanhos.length > 0)) && (
        <Aviso tipo="info">
          {(form.comTamanhos ? semPrecoNosTamanhos : semPreco).join(', ')}{' '}
          {(form.comTamanhos ? semPrecoNosTamanhos : semPreco).length === 1 ? 'está sem preço e não entra' : 'estão sem preço e não entram'} na
          conta. O custo real pode ser maior.
        </Aviso>
      )}

      <Botao type="submit" tamanho="grande" cor={ACCENT} larguraTotal disabled={salvando}>
        {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar produto'}
      </Botao>
    </form>
  );
}
