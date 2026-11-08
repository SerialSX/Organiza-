import { useId, useState } from 'react';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import Campo, { classeCampo } from '../ui/Campo';
import Carregando from '../ui/Carregando';
import EstadoVazio from '../ui/EstadoVazio';
import Interruptor from '../ui/Interruptor';
import { CloseIcon, ComboIcon, PencilIcon, PlusIcon, TrashIcon } from '../icons/AppIcons';
import { formatarMoeda, lerValor, valorParaCampo } from '../../lib/formatadores';
import {
  LIMITE_NOME_COMBO,
  LIMITE_NOME_PARTE,
  MAXIMO_DE_OPCOES,
  MAXIMO_DE_PARTES,
  MINIMO_DE_PARTES,
  opcaoNoCardapio,
  opcoesDoCardapio,
  resumoDoCombo,
  situacaoDoCombo,
  somaDasPartes,
  textoDaEconomia,
} from '../../lib/combos';
import { nomeDoItem } from '../../lib/meioAMeio';
import { excluirCombo, mudarDisponivelDoCombo, salvarCombo } from '../../services/combos';

const ACCENT = 'var(--color-accent-produtos)';

let sequencia = 0;
const novaChave = () => `combo-${++sequencia}`;
const opcaoVazia = () => ({ chave: novaChave(), valor: '', acrescimo: '' });
const parteVazia = () => ({ chave: novaChave(), nome: '', opcoes: [opcaoVazia()] });
const formVazio = () => ({ id: null, nome: '', preco: '', partes: [parteVazia(), parteVazia()] });

// O combo salvo, do jeito do formulário. Produto que saiu do cardápio (ou
// mudou de tamanhos) volta vazio, para o dono escolher de novo.
function formDoCombo(combo, porId) {
  let faltou = false;
  const partes = combo.partes.map((parte) => ({
    chave: novaChave(),
    nome: parte.nome ?? '',
    opcoes: parte.opcoes.map((o) => {
      const noCardapio = opcaoNoCardapio(o, porId);
      if (!noCardapio) faltou = true;
      return {
        chave: novaChave(),
        valor: noCardapio ? `${o.produto_id}|${o.tamanho_id ?? ''}` : '',
        acrescimo: o.acrescimo > 0 ? valorParaCampo(o.acrescimo) : '',
      };
    }),
  }));
  return { id: combo.id, nome: combo.nome, preco: valorParaCampo(combo.preco), partes, faltou };
}

function BotaoIcone({ rotulo, onClick, perigo = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      className={`w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--surface-card-hover)] ${perigo ? 'text-[var(--texto-cozinha)]' : 'text-[var(--text-primary)]'}`}
    >
      {children}
    </button>
  );
}

function OpcaoDaParte({ opcao, indice, total, numeroDaParte, cardapio, onMudar, onTirar }) {
  const id = useId();
  const escolha = total > 1;
  const rotulo = escolha ? `Opção ${indice + 1}` : 'Produto';
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5 flex-1 min-w-48">
        <label htmlFor={id} className="text-sm font-medium text-[var(--text-secondary)]">
          {rotulo}
        </label>
        <select
          id={id}
          value={opcao.valor}
          onChange={(e) => onMudar({ valor: e.target.value })}
          className={classeCampo}
          aria-label={`Parte ${numeroDaParte}, ${rotulo.toLowerCase()}`}
        >
          <option value="">Escolha um produto</option>
          {cardapio.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo} ({formatarMoeda(c.preco)})
            </option>
          ))}
        </select>
      </div>
      {escolha && (
        <Campo
          rotulo="A mais (R$, opcional)"
          className="w-36"
          value={opcao.acrescimo}
          onChange={(e) => onMudar({ acrescimo: e.target.value })}
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Parte ${numeroDaParte}, opção ${indice + 1}, a mais (R$, opcional)`}
        />
      )}
      {escolha && (
        <BotaoIcone rotulo={`Tirar a opção ${indice + 1} da parte ${numeroDaParte}`} onClick={onTirar} perigo>
          <CloseIcon className="w-5 h-5" />
        </BotaoIcone>
      )}
    </div>
  );
}

function FormularioCombo({ inicial, produtos, onSalvo, onCancelar }) {
  const [form, setForm] = useState(inicial);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const editando = Boolean(inicial.id);
  const cardapio = opcoesDoCardapio(produtos);
  const porValor = Object.fromEntries(cardapio.map((c) => [c.valor, c]));

  const mudarParte = (chave, mudar) => setForm((f) => ({ ...f, partes: f.partes.map((p) => (p.chave === chave ? mudar(p) : p)) }));
  const mudarOpcao = (parte, opcao, valores) =>
    mudarParte(parte, (p) => ({ ...p, opcoes: p.opcoes.map((o) => (o.chave === opcao ? { ...o, ...valores } : o)) }));

  // O cliente pagaria separado: a opção mais barata de cada parte.
  const precoDigitado = lerValor(form.preco);
  const partesProntas = form.partes.every((p) => p.opcoes.some((o) => porValor[o.valor]));
  const separado = form.partes.reduce((s, p) => {
    const precos = p.opcoes.filter((o) => porValor[o.valor]).map((o) => porValor[o.valor].preco);
    return s + (precos.length ? Math.min(...precos) : 0);
  }, 0);
  const economia = Number.isFinite(precoDigitado) && partesProntas ? textoDaEconomia(precoDigitado, separado) : '';

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    const preco = lerValor(form.preco);
    for (const [i, parte] of form.partes.entries()) {
      if (parte.opcoes.some((o) => !porValor[o.valor])) {
        setErro(`Escolha o produto da parte ${i + 1}.`);
        return;
      }
      if (parte.opcoes.some((o) => o.acrescimo.trim() && !Number.isFinite(lerValor(o.acrescimo)))) {
        setErro(`Na parte ${i + 1}, digite o valor a mais como 2,00 ou deixe em branco.`);
        return;
      }
    }
    if (!Number.isFinite(preco)) {
      setErro('Digite o preço do combo, como 25,00.');
      return;
    }
    setSalvando(true);
    try {
      await salvarCombo({
        id: form.id,
        nome: form.nome,
        preco,
        partes: form.partes.map((parte) => ({
          nome: parte.opcoes.length > 1 ? parte.nome : null,
          opcoes: parte.opcoes.map((o) => {
            const item = porValor[o.valor];
            return {
              produto_id: item.produto_id,
              tamanho_id: item.tamanho_id,
              acrescimo: parte.opcoes.length > 1 && o.acrescimo.trim() ? lerValor(o.acrescimo) : 0,
              rotulo: item.rotulo,
            };
          }),
        })),
      });
      onSalvo(editando);
    } catch (falha) {
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={salvar}
      noValidate
      aria-labelledby="titulo-formulario-combo"
      className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 sm:p-6 mb-6 flex flex-col gap-5"
      style={{ borderColor: ACCENT }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-formulario-combo" className="text-lg font-semibold text-[var(--text-primary)]">
          {editando ? 'Editar combo' : 'Novo combo'}
        </h2>
        <BotaoIcone rotulo="Fechar sem salvar" onClick={onCancelar}>
          <CloseIcon className="w-5 h-5" />
        </BotaoIcone>
      </div>

      {inicial.faltou && (
        <Aviso tipo="info">Um dos produtos deste combo saiu do cardápio ou mudou de tamanhos. Escolha de novo onde estiver vazio.</Aviso>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Campo
          rotulo="Nome"
          className="sm:col-span-2"
          value={form.nome}
          onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
          placeholder="Ex.: Combo X-Burguer"
          autoComplete="off"
          autoFocus
          maxLength={LIMITE_NOME_COMBO}
        />
        <Campo
          rotulo="Preço do combo (R$)"
          value={form.preco}
          onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))}
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-4">
        {form.partes.map((parte, i) => (
          <fieldset key={parte.chave} className="rounded-xl border border-[var(--border-subtle)] p-4 flex flex-col gap-3 min-w-0">
            <legend className="px-1 text-base font-semibold text-[var(--text-primary)]">
              Parte {i + 1}
              {parte.opcoes.length > 1 ? ': o cliente escolhe 1' : ''}
            </legend>
            {parte.opcoes.length > 1 && (
              <Campo
                rotulo="Nome da parte (opcional)"
                value={parte.nome}
                onChange={(e) => mudarParte(parte.chave, (p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex.: Bebida"
                autoComplete="off"
                maxLength={LIMITE_NOME_PARTE}
                aria-label={`Parte ${i + 1}, nome da parte (opcional)`}
              />
            )}
            {parte.opcoes.map((opcao, j) => (
              <OpcaoDaParte
                key={opcao.chave}
                opcao={opcao}
                indice={j}
                total={parte.opcoes.length}
                numeroDaParte={i + 1}
                cardapio={cardapio}
                onMudar={(valores) => mudarOpcao(parte.chave, opcao.chave, valores)}
                onTirar={() => mudarParte(parte.chave, (p) => ({ ...p, opcoes: p.opcoes.filter((o) => o.chave !== opcao.chave) }))}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              {parte.opcoes.length < MAXIMO_DE_OPCOES && (
                <Botao variante="secundaria" onClick={() => mudarParte(parte.chave, (p) => ({ ...p, opcoes: [...p.opcoes, opcaoVazia()] }))}>
                  <PlusIcon className="w-5 h-5" />
                  {parte.opcoes.length > 1 ? 'Mais uma opção' : 'Deixar o cliente escolher'}
                </Botao>
              )}
              {form.partes.length > MINIMO_DE_PARTES && (
                <Botao variante="secundaria" onClick={() => setForm((f) => ({ ...f, partes: f.partes.filter((p) => p.chave !== parte.chave) }))}>
                  <TrashIcon className="w-5 h-5" />
                  Tirar a parte {i + 1}
                </Botao>
              )}
            </div>
          </fieldset>
        ))}
        {form.partes.length < MAXIMO_DE_PARTES && (
          <Botao variante="secundaria" className="self-start" onClick={() => setForm((f) => ({ ...f, partes: [...f.partes, parteVazia()] }))}>
            <PlusIcon className="w-5 h-5" />
            Mais uma parte
          </Botao>
        )}
      </div>

      <p className="text-sm text-[var(--text-secondary)]">
        Parte com uma opção já vem no combo. Com mais de uma, quem atende escolhe na hora (a bebida, o sabor). Pizzas meio a
        meio do mesmo tamanho podem ser dois sabores na mesma parte, pelo mesmo preço.
      </p>

      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {partesProntas && separado > 0 && Number.isFinite(precoDigitado) && (
          <Aviso tipo={economia ? 'sucesso' : 'info'}>
            Separado sai por {formatarMoeda(separado)}.{' '}
            {economia ? `${economia}.` : 'O combo não está mais barato que as partes separadas.'}
          </Aviso>
        )}
        {erro && <Aviso>{erro}</Aviso>}
      </div>

      <Botao type="submit" tamanho="grande" cor={ACCENT} larguraTotal disabled={salvando}>
        {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar combo'}
      </Botao>
    </form>
  );
}

function CartaoCombo({ combo, porId, onEditar, onErro }) {
  const [confirmando, setConfirmando] = useState(false);
  const [mudando, setMudando] = useState(false);
  const situacao = situacaoDoCombo(combo, porId);
  const soma = somaDasPartes(combo, porId);
  const economia = situacao.mudou ? '' : textoDaEconomia(combo.preco, soma);

  async function alternar() {
    setMudando(true);
    try {
      await mudarDisponivelDoCombo(combo.id, !combo.disponivel);
    } catch (e) {
      onErro(e.message);
    } finally {
      setMudando(false);
    }
  }

  async function excluir() {
    try {
      await excluirCombo(combo.id);
    } catch (e) {
      setConfirmando(false);
      onErro(e.message);
    }
  }

  const esgotado = situacao.esgotado;
  return (
    <li className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 flex flex-col gap-3">
      <div>
        <p className="text-lg font-semibold text-[var(--text-primary)] break-words">{combo.nome}</p>
        <p className="text-2xl font-bold tabular-nums text-[var(--texto-produtos)]">{formatarMoeda(combo.preco)}</p>
        <p className="text-sm text-[var(--text-secondary)] mt-1 break-words">{resumoDoCombo(combo, porId)}</p>
        {economia && <p className="text-sm font-medium text-[var(--text-primary)] mt-1">{economia}</p>}
      </div>
      {situacao.mudou && (
        <Aviso tipo="info">Um dos produtos deste combo saiu do cardápio ou mudou de tamanhos. Edite o combo para voltar a vender.</Aviso>
      )}
      {esgotado && (
        <p className="text-sm font-medium text-[var(--texto-cozinha)]">
          Esgotado: acabou {nomeDoItem(esgotado.produto.nome, esgotado.tamanho?.nome ?? null, null)}.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[var(--text-primary)]">{combo.disponivel ? 'Disponível' : 'Esgotado'}</span>
        <Interruptor ligado={combo.disponivel} onChange={alternar} disabled={mudando} rotulo={`${combo.nome} disponível`} />
      </div>
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Excluir ${combo.nome}?`}>
          <span className="text-sm text-[var(--text-primary)]">Sai do cardápio. Os pedidos já feitos não mudam. Excluir?</span>
          <Botao variante="perigo" onClick={excluir}>
            Sim
          </Botao>
          <Botao variante="secundaria" onClick={() => setConfirmando(false)}>
            Não
          </Botao>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <BotaoIcone rotulo={`Editar ${combo.nome}`} onClick={onEditar}>
            <PencilIcon className="w-5 h-5" />
          </BotaoIcone>
          <BotaoIcone rotulo={`Excluir ${combo.nome}`} onClick={() => setConfirmando(true)} perigo>
            <TrashIcon className="w-5 h-5" />
          </BotaoIcone>
        </div>
      )}
    </li>
  );
}

// Combos: preço fixo, partes que já vêm e partes que o cliente escolhe.
export default function AbaCombos({ combos, carregando, erroCarga, produtos, recarregar }) {
  const [formulario, setFormulario] = useState(null);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const porId = Object.fromEntries(produtos.map((p) => [p.id, p]));

  function abrir(form) {
    setErro('');
    setMensagem('');
    setFormulario(form);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function aoSalvar(editando) {
    setFormulario(null);
    setMensagem(editando ? 'Combo atualizado. Pedidos já feitos não mudam.' : 'Combo salvo. Ele já aparece em Pedidos.');
    recarregar();
  }

  const semProdutos = produtos.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <p className="flex-1 min-w-60 text-sm text-[var(--text-secondary)]">
          Produtos que saem juntos por um preço só. Na cozinha aparece o nome do combo com cada parte, e os relatórios
          contam cada produto vendido.
        </p>
        {!formulario && combos.length > 0 && (
          <Botao cor={ACCENT} onClick={() => abrir(formVazio())}>
            <PlusIcon className="w-5 h-5" />
            Novo combo
          </Botao>
        )}
      </div>

      {formulario && (
        <FormularioCombo
          key={formulario.id ?? 'novo'}
          inicial={formulario}
          produtos={produtos}
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
        <Carregando texto="Carregando combos…" />
      ) : combos.length === 0 ? (
        !formulario && (
          <EstadoVazio
            icon={ComboIcon}
            accent={ACCENT}
            titulo="Nenhum combo ainda"
            texto={
              semProdutos
                ? 'Cadastre os produtos primeiro. Depois junte alguns num combo, como lanche, batata e bebida.'
                : 'Junte produtos por um preço só, como lanche, batata e bebida. A bebida pode ser à escolha do cliente.'
            }
          >
            {!semProdutos && (
              <Botao cor={ACCENT} tamanho="grande" onClick={() => abrir(formVazio())} className="mt-2">
                <PlusIcon className="w-5 h-5" />
                Montar o primeiro combo
              </Botao>
            )}
          </EstadoVazio>
        )
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {combos.map((c) => (
            <CartaoCombo key={c.id} combo={c} porId={porId} onEditar={() => abrir(formDoCombo(c, porId))} onErro={setErro} />
          ))}
        </ul>
      )}
    </div>
  );
}
