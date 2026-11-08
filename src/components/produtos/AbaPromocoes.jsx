import { useId, useState } from 'react';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import Campo, { classeCampo } from '../ui/Campo';
import Carregando from '../ui/Carregando';
import EstadoVazio from '../ui/EstadoVazio';
import Etiqueta from '../ui/Etiqueta';
import Interruptor from '../ui/Interruptor';
import { CloseIcon, PencilIcon, PlusIcon, TagIcon, TrashIcon } from '../icons/AppIcons';
import { formatarMoeda, lerValor, valorParaCampo } from '../../lib/formatadores';
import { opcoesDoCardapio } from '../../lib/combos';
import {
  DIAS_DA_SEMANA,
  LIMITE_NOME_PROMOCAO,
  MAXIMO_DE_ITENS_NA_PROMOCAO,
  promocaoVale,
  textoDoHorario,
} from '../../lib/promocoes';
import { useAgora } from '../../hooks/useCombos';
import { apagarPromocao, mudarAtivaDaPromocao, salvarPromocao } from '../../services/promocoes';

const ACCENT = 'var(--color-accent-produtos)';

let sequencia = 0;
const novaChave = () => `promo-${++sequencia}`;
const itemVazio = () => ({ chave: novaChave(), valor: '', preco: '' });
const formVazio = () => ({ id: null, nome: '', dias: [], diaTodo: true, inicio: '', fim: '', itens: [itemVazio()] });

// Tudo que pode entrar na promoção, por valor do <select>: "p|produto|tamanho"
// e "c|combo". { valor, rotulo, preco, produto_id, tamanho_id, combo_id }
function alvosDoCardapio(produtos, combos) {
  return [
    ...opcoesDoCardapio(produtos).map((o) => ({ ...o, valor: `p|${o.valor}`, combo_id: null })),
    ...combos.map((c) => ({ valor: `c|${c.id}`, rotulo: c.nome, preco: c.preco, produto_id: null, tamanho_id: null, combo_id: c.id })),
  ];
}

const valorDoItem = (i) => (i.combo_id ? `c|${i.combo_id}` : `p|${i.produto_id}|${i.tamanho_id ?? ''}`);

// A promoção salva, do jeito do formulário. Item que saiu do cardápio fica de
// fora (e o formulário avisa).
function formDaPromocao(promo, porValor) {
  const itens = promo.itens
    .filter((i) => porValor[valorDoItem(i)])
    .map((i) => ({ chave: novaChave(), valor: valorDoItem(i), preco: valorParaCampo(i.preco) }));
  return {
    id: promo.id,
    nome: promo.nome,
    dias: promo.dias,
    diaTodo: !promo.hora_inicio,
    inicio: promo.hora_inicio ?? '',
    fim: promo.hora_fim ?? '',
    itens: itens.length ? itens : [itemVazio()],
    faltou: itens.length < promo.itens.length,
  };
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

function ItemDaPromocao({ item, indice, total, alvos, porValor, onMudar, onTirar }) {
  const id = useId();
  const alvo = porValor[item.valor];
  const produtos = alvos.filter((a) => !a.combo_id);
  const combos = alvos.filter((a) => a.combo_id);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5 flex-1 min-w-48">
        <label htmlFor={id} className="text-sm font-medium text-[var(--text-secondary)]">
          Item {indice + 1}
        </label>
        <select id={id} value={item.valor} onChange={(e) => onMudar({ valor: e.target.value })} className={classeCampo}>
          <option value="">Escolha um produto ou combo</option>
          <optgroup label="Produtos">
            {produtos.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.rotulo}
              </option>
            ))}
          </optgroup>
          {combos.length > 0 && (
            <optgroup label="Combos">
              {combos.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.rotulo}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <Campo
        rotulo="Preço na promoção (R$)"
        className="w-44"
        value={item.preco}
        onChange={(e) => onMudar({ preco: e.target.value })}
        placeholder="0,00"
        inputMode="decimal"
        autoComplete="off"
        dica={alvo ? `Normal: ${formatarMoeda(alvo.preco)}` : undefined}
        aria-label={`Item ${indice + 1}, preço na promoção (R$)`}
      />
      {total > 1 && (
        <BotaoIcone rotulo={`Tirar o item ${indice + 1}`} onClick={onTirar} perigo>
          <CloseIcon className="w-5 h-5" />
        </BotaoIcone>
      )}
    </div>
  );
}

function FormularioPromocao({ inicial, alvos, onSalvo, onCancelar }) {
  const [form, setForm] = useState(inicial);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const idHorario = useId();
  const editando = Boolean(inicial.id);
  const porValor = Object.fromEntries(alvos.map((a) => [a.valor, a]));

  const mudar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const mudarItem = (chave, valores) => setForm((f) => ({ ...f, itens: f.itens.map((i) => (i.chave === chave ? { ...i, ...valores } : i)) }));
  const alternarDia = (dia) =>
    setForm((f) => ({ ...f, dias: f.dias.includes(dia) ? f.dias.filter((d) => d !== dia) : [...f.dias, dia] }));

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    const vistos = new Set();
    for (const [i, item] of form.itens.entries()) {
      const alvo = porValor[item.valor];
      if (!alvo) {
        setErro(`Escolha o item ${i + 1} da promoção.`);
        return;
      }
      if (vistos.has(item.valor)) {
        setErro(`${alvo.rotulo} aparece duas vezes na promoção.`);
        return;
      }
      vistos.add(item.valor);
    }
    setSalvando(true);
    try {
      await salvarPromocao({
        id: form.id,
        nome: form.nome,
        dias: form.dias,
        diaTodo: form.diaTodo,
        inicio: form.inicio,
        fim: form.fim,
        itens: form.itens.map((item) => {
          const alvo = porValor[item.valor];
          return {
            produto_id: alvo.produto_id,
            tamanho_id: alvo.tamanho_id,
            combo_id: alvo.combo_id,
            preco: lerValor(item.preco),
            nome: alvo.rotulo,
            normal: alvo.preco,
            combo: Boolean(alvo.combo_id),
          };
        }),
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
      aria-labelledby="titulo-formulario-promocao"
      className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 sm:p-6 mb-6 flex flex-col gap-5"
      style={{ borderColor: ACCENT }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-formulario-promocao" className="text-lg font-semibold text-[var(--text-primary)]">
          {editando ? 'Editar promoção' : 'Nova promoção'}
        </h2>
        <BotaoIcone rotulo="Fechar sem salvar" onClick={onCancelar}>
          <CloseIcon className="w-5 h-5" />
        </BotaoIcone>
      </div>

      {inicial.faltou && <Aviso tipo="info">Um item desta promoção saiu do cardápio e ficou de fora. Salve para confirmar.</Aviso>}

      <Campo
        rotulo="Nome"
        value={form.nome}
        onChange={(e) => mudar('nome', e.target.value)}
        placeholder="Ex.: Terça do hambúrguer, Happy hour"
        autoComplete="off"
        autoFocus
        maxLength={LIMITE_NOME_PROMOCAO}
      />

      <fieldset className="flex flex-col gap-2 min-w-0">
        <legend className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Dias da semana</legend>
        <div className="flex flex-wrap gap-2">
          {DIAS_DA_SEMANA.map((d) => {
            const ligado = form.dias.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={ligado}
                aria-label={d.nome}
                onClick={() => alternarDia(d.id)}
                className="min-w-14 min-h-12 rounded-xl border-2 px-3 font-semibold transition-colors"
                style={{
                  borderColor: ligado ? ACCENT : 'var(--border-subtle)',
                  backgroundColor: ligado ? 'color-mix(in srgb, var(--color-accent-produtos) 16%, transparent)' : undefined,
                  color: 'var(--text-primary)',
                }}
              >
                {d.curto}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 min-w-0" aria-describedby={`${idHorario}-dica`}>
        <legend className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Horário</legend>
        <label className="flex min-h-11 items-center gap-3 text-base font-medium text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={form.diaTodo}
            onChange={(e) => mudar('diaTodo', e.target.checked)}
            className="w-5 h-5 accent-[var(--color-accent-produtos)]"
          />
          O dia todo
        </label>
        {!form.diaTodo && (
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <Campo rotulo="Começa às" type="time" value={form.inicio} onChange={(e) => mudar('inicio', e.target.value)} />
            <Campo rotulo="Termina às" type="time" value={form.fim} onChange={(e) => mudar('fim', e.target.value)} />
          </div>
        )}
        <p id={`${idHorario}-dica`} className="text-xs text-[var(--text-secondary)]">
          {form.diaTodo
            ? 'Vale do começo ao fim do dia de trabalho (até as 5h do dia seguinte).'
            : 'Pode começar a partir das 5h. Passando da meia-noite (das 22h às 2h, por exemplo), pode ir até as 5h.'}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3 min-w-0">
        <legend className="mb-2 text-sm font-medium text-[var(--text-secondary)]">O que fica mais barato</legend>
        {form.itens.map((item, i) => (
          <ItemDaPromocao
            key={item.chave}
            item={item}
            indice={i}
            total={form.itens.length}
            alvos={alvos}
            porValor={porValor}
            onMudar={(valores) => mudarItem(item.chave, valores)}
            onTirar={() => setForm((f) => ({ ...f, itens: f.itens.filter((x) => x.chave !== item.chave) }))}
          />
        ))}
        {form.itens.length < MAXIMO_DE_ITENS_NA_PROMOCAO && (
          <Botao variante="secundaria" className="self-start" onClick={() => setForm((f) => ({ ...f, itens: [...f.itens, itemVazio()] }))}>
            <PlusIcon className="w-5 h-5" />
            Mais um item
          </Botao>
        )}
      </fieldset>

      <p className="text-sm text-[var(--text-secondary)]">
        Repete toda semana até você pausar ou apagar. Pedido feito durante a promoção mantém o preço, mesmo editado depois.
      </p>

      <div aria-live="polite" className="empty:hidden">
        {erro && <Aviso>{erro}</Aviso>}
      </div>

      <Botao type="submit" tamanho="grande" cor={ACCENT} larguraTotal disabled={salvando}>
        {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar promoção'}
      </Botao>
    </form>
  );
}

function CartaoPromocao({ promo, porValor, agora, onEditar, onErro }) {
  const [confirmando, setConfirmando] = useState(false);
  const [mudando, setMudando] = useState(false);
  const valendo = promocaoVale(promo, agora);

  async function alternar() {
    setMudando(true);
    try {
      await mudarAtivaDaPromocao(promo.id, !promo.ativa);
    } catch (e) {
      onErro(e.message);
    } finally {
      setMudando(false);
    }
  }

  async function apagar() {
    try {
      await apagarPromocao(promo.id);
    } catch (e) {
      setConfirmando(false);
      onErro(e.message);
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold text-[var(--text-primary)] break-words">{promo.nome}</p>
          {valendo && <Etiqueta cor="var(--color-accent-relatorios)">Valendo agora</Etiqueta>}
        </div>
        <p className="text-sm text-[var(--text-secondary)]">{textoDoHorario(promo)}</p>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {promo.itens.map((i) => {
          const alvo = porValor[valorDoItem(i)];
          return (
            <li key={i.id} className="break-words text-[var(--text-primary)]">
              {alvo ? alvo.rotulo : 'Item que saiu do cardápio'}:{' '}
              <span className="font-semibold tabular-nums">{formatarMoeda(i.preco)}</span>
              {alvo && i.preco < alvo.preco && (
                <span className="text-[var(--text-secondary)]">
                  {' '}
                  (normal <s className="tabular-nums">{formatarMoeda(alvo.preco)}</s>)
                </span>
              )}
              {alvo && i.preco >= alvo.preco && (
                <span className="text-[var(--texto-cozinha)]"> (não vale: o preço normal está {formatarMoeda(alvo.preco)})</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[var(--text-primary)]">{promo.ativa ? 'Ligada' : 'Pausada'}</span>
        <Interruptor ligado={promo.ativa} onChange={alternar} disabled={mudando} rotulo={`${promo.nome} ligada`} />
      </div>
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Apagar ${promo.nome}?`}>
          <span className="text-sm text-[var(--text-primary)]">Apaga de vez. Os pedidos já feitos mantêm o preço. Apagar?</span>
          <Botao variante="perigo" onClick={apagar}>
            Sim
          </Botao>
          <Botao variante="secundaria" onClick={() => setConfirmando(false)}>
            Não
          </Botao>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <BotaoIcone rotulo={`Editar ${promo.nome}`} onClick={onEditar}>
            <PencilIcon className="w-5 h-5" />
          </BotaoIcone>
          <BotaoIcone rotulo={`Apagar ${promo.nome}`} onClick={() => setConfirmando(true)} perigo>
            <TrashIcon className="w-5 h-5" />
          </BotaoIcone>
        </div>
      )}
    </li>
  );
}

// Promoções por dia da semana e horário: o preço muda sozinho em Pedidos.
export default function AbaPromocoes({ promocoes, combos, carregando, erroCarga, produtos, recarregar }) {
  const [formulario, setFormulario] = useState(null);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const agora = useAgora();
  const alvos = alvosDoCardapio(produtos, combos);
  const porValor = Object.fromEntries(alvos.map((a) => [a.valor, a]));

  function abrir(form) {
    setErro('');
    setMensagem('');
    setFormulario(form);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function aoSalvar(editando) {
    setFormulario(null);
    setMensagem(editando ? 'Promoção atualizada.' : 'Promoção salva. Nos dias e horários dela, o preço muda sozinho em Pedidos.');
    recarregar();
  }

  const semProdutos = alvos.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <p className="flex-1 min-w-60 text-sm text-[var(--text-secondary)]">
          Preço mais baixo em certos dias e horários, como a terça do hambúrguer ou o happy hour. Em Pedidos aparece o
          preço da promoção com o normal riscado.
        </p>
        {!formulario && promocoes.length > 0 && (
          <Botao cor={ACCENT} onClick={() => abrir(formVazio())}>
            <PlusIcon className="w-5 h-5" />
            Nova promoção
          </Botao>
        )}
      </div>

      {formulario && (
        <FormularioPromocao
          key={formulario.id ?? 'nova'}
          inicial={formulario}
          alvos={alvos}
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
        <Carregando texto="Carregando promoções…" />
      ) : promocoes.length === 0 ? (
        !formulario && (
          <EstadoVazio
            icon={TagIcon}
            accent={ACCENT}
            titulo="Nenhuma promoção ainda"
            texto={
              semProdutos
                ? 'Cadastre os produtos primeiro. Depois crie promoções por dia e horário.'
                : 'Escolha os dias, o horário e o preço. O preço muda sozinho em Pedidos e volta ao normal depois.'
            }
          >
            {!semProdutos && (
              <Botao cor={ACCENT} tamanho="grande" onClick={() => abrir(formVazio())} className="mt-2">
                <PlusIcon className="w-5 h-5" />
                Criar a primeira promoção
              </Botao>
            )}
          </EstadoVazio>
        )
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {promocoes.map((p) => (
            <CartaoPromocao
              key={p.id}
              promo={p}
              porValor={porValor}
              agora={agora}
              onEditar={() => abrir(formDaPromocao(p, porValor))}
              onErro={setErro}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
