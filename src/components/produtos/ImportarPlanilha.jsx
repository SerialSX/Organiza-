import { useId, useMemo, useRef, useState } from 'react';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import Campo from '../ui/Campo';
import Carregando from '../ui/Carregando';
import { CloseIcon, DownloadIcon, SheetIcon } from '../icons/AppIcons';
import { criarProdutos, atualizarProduto } from '../../services/produtos';
import { lerArquivoDePlanilha, ErroDePlanilha } from '../../lib/lerPlanilha';
import { baixarModelo } from '../../lib/modeloDePlanilha';
import { interpretarPlanilha, montarRevisao, precisaDeAtencao, errosDoItem, oQueSalvar, chaveDoNome } from '../../lib/importarPlanilha';
import { formatarMoeda, lerValor } from '../../lib/formatadores';

const ACCENT = 'var(--color-accent-produtos)';
const ACEITA =
  '.xlsx,.xls,.ods,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

const opcao =
  'cursor-pointer rounded-xl border-2 px-4 py-3 flex items-center gap-2 min-h-12 text-[var(--text-primary)] transition-colors has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--cor-foco)]';

function precoParaTexto(texto) {
  const valor = lerValor(texto);
  return valor > 0 ? formatarMoeda(valor) : 'sem preço';
}

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

// Os campos de uma linha da planilha: nome (só de produto novo), preço, custo
// (se a planilha tinha a coluna) e se vai para a cozinha.
function CamposDoItem({ item, prefixo, temCusto, comNome, erros, desabilitado, onMudar }) {
  return (
    <div className="flex flex-col gap-3">
      <div className={`grid grid-cols-1 gap-3 ${temCusto ? 'sm:grid-cols-[1fr_9rem_9rem]' : 'sm:grid-cols-[1fr_10rem]'}`}>
        {comNome ? (
          <Campo
            rotulo="Nome"
            name={`nome-${prefixo}`}
            value={item.nome}
            onChange={(e) => onMudar('nome', e.target.value)}
            maxLength={120}
            autoComplete="off"
            erro={erros?.nome}
            dica={item.nomeLongo ? 'O nome era maior que 120 letras e foi cortado.' : undefined}
            disabled={desabilitado}
          />
        ) : (
          <span className="hidden sm:block" />
        )}
        <Campo
          rotulo="Preço (R$)"
          name={`preco-${prefixo}`}
          value={item.preco}
          onChange={(e) => onMudar('preco', e.target.value)}
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
          erro={erros?.preco}
          dica={item.preco === '' ? 'A planilha não tinha o preço.' : undefined}
          disabled={desabilitado}
        />
        {temCusto && (
          <Campo
            rotulo="Custo (R$)"
            name={`custo-${prefixo}`}
            value={item.custo}
            onChange={(e) => onMudar('custo', e.target.value)}
            placeholder="Opcional"
            inputMode="decimal"
            autoComplete="off"
            erro={erros?.custo}
            disabled={desabilitado}
          />
        )}
      </div>
      <label className="flex items-start gap-3 min-h-11 text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={item.vaiParaCozinha}
          onChange={(e) => onMudar('vaiParaCozinha', e.target.checked)}
          disabled={desabilitado}
          className="mt-0.5 w-6 h-6 shrink-0 accent-[var(--color-accent-produtos)]"
        />
        <span className="flex flex-col">
          <span className="font-medium">Vai para a cozinha</span>
          {item.cozinhaAdivinhada && !item.vaiParaCozinha && (
            <span className="text-sm text-[var(--text-secondary)]">Parece bebida: entra na conta, mas não aparece na fila da cozinha.</span>
          )}
        </span>
      </label>
    </div>
  );
}

function LinhaSimples({ grupo, indice, temCusto, erros, desabilitado, onEscolher, onMudar }) {
  const [item] = grupo.ocorrencias;
  const marcado = grupo.escolha === 0;
  return (
    <li className="rounded-xl border border-[var(--border-subtle)] p-4 flex flex-col gap-3" style={{ opacity: marcado ? 1 : 0.7 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-3 min-h-11 font-medium text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={marcado}
            onChange={(e) => onEscolher(e.target.checked ? 0 : 'nenhuma')}
            aria-label={`Importar ${item.nome || `a linha ${item.linha}`}`}
            disabled={desabilitado}
            className="w-6 h-6 accent-[var(--color-accent-produtos)]"
          />
          Importar
        </label>
        <span className="text-sm text-[var(--text-secondary)]">
          Linha {item.linha}
          {grupo.repetidasIguais.length > 0 && ` (repetida igual na ${grupo.repetidasIguais.join(', ')})`}
        </span>
      </div>
      {marcado && (
        <CamposDoItem
          item={item}
          prefixo={indice}
          temCusto={temCusto}
          comNome
          erros={erros}
          desabilitado={desabilitado}
          onMudar={(campo, valor) => onMudar(0, campo, valor)}
        />
      )}
    </li>
  );
}

// Nome repetido com valores diferentes ou produto que já está no cardápio:
// o dono escolhe qual vale.
function LinhaComEscolha({ grupo, indice, temCusto, erros, desabilitado, onEscolher, onMudar }) {
  const nomeRadio = useId();
  const { existente, ocorrencias, escolha } = grupo;
  const nome = existente?.nome ?? ocorrencias[0].nome;
  const escolhido = typeof escolha === 'number' ? ocorrencias[escolha] : null;
  const opcoes = [
    existente
      ? { valor: 'manter', rotulo: `Manter como está (${formatarMoeda(existente.preco)})` }
      : { valor: 'nenhuma', rotulo: 'Não importar' },
    ...ocorrencias.map((o, i) => ({
      valor: i,
      rotulo: `${existente ? 'Usar o da planilha' : 'Usar a linha'} ${o.linha}: ${precoParaTexto(o.preco)}`,
    })),
  ];
  return (
    <li className="rounded-xl border-2 p-4 flex flex-col gap-3" style={{ borderColor: erros?.escolha ? 'var(--texto-cozinha)' : 'var(--border-subtle)' }}>
      <fieldset className="flex flex-col gap-2 min-w-0" disabled={desabilitado}>
        <legend className="font-semibold text-[var(--text-primary)] mb-2">
          {existente
            ? `"${nome}" já está no cardápio por ${formatarMoeda(existente.preco)}.`
            : `"${nome}" aparece ${ocorrencias.length} vezes na planilha, com valores diferentes. Qual vale?`}
        </legend>
        {opcoes.map((o, i) => {
          const marcado = escolha === o.valor;
          return (
            <label
              key={String(o.valor)}
              className={opcao}
              style={{
                borderColor: marcado ? ACCENT : 'var(--border-subtle)',
                backgroundColor: marcado ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
              }}
            >
              <input
                type="radio"
                name={nomeRadio}
                data-escolha={i === 0 ? `escolha-${indice}` : undefined}
                checked={marcado}
                onChange={() => onEscolher(o.valor)}
                className="w-5 h-5 shrink-0 accent-[var(--color-accent-produtos)]"
              />
              {o.rotulo}
            </label>
          );
        })}
        {erros?.escolha && <p className="text-sm font-medium text-[var(--texto-cozinha)]">{erros.escolha}</p>}
      </fieldset>
      {escolhido && (
        <CamposDoItem
          item={escolhido}
          prefixo={indice}
          temCusto={temCusto}
          comNome={!existente}
          erros={erros}
          desabilitado={desabilitado}
          onMudar={(campo, valor) => onMudar(escolha, campo, valor)}
        />
      )}
    </li>
  );
}

export default function ImportarPlanilha({ produtos, negocioId, onFechar, onImportado }) {
  // arquivo: explicação e modelo; lendo; conferir: lista; salvando
  const [etapa, setEtapa] = useState('arquivo');
  const [grupos, setGrupos] = useState([]);
  const [temCusto, setTemCusto] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState('');
  const entrada = useRef(null);
  const formulario = useRef(null);

  const { novos, atualizar } = useMemo(() => oQueSalvar(grupos.filter((g) => typeof g.escolha === 'number')), [grupos]);
  // Separado na leitura: o item não muda de lista enquanto a pessoa corrige.
  const atencao = grupos.map((g, i) => [g, i]).filter(([g]) => g.atencao);
  const prontos = grupos.map((g, i) => [g, i]).filter(([g]) => !g.atencao);
  const repetidasIguais = grupos.reduce((s, g) => s + g.repetidasIguais.length, 0);
  const salvando = etapa === 'salvando';

  async function aoEscolherArquivo(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro('');
    setEtapa('lendo');
    try {
      const { itens, temCusto: comCusto } = interpretarPlanilha(await lerArquivoDePlanilha(arquivo));
      setGrupos(montarRevisao(itens, produtos).map((g) => ({ ...g, atencao: precisaDeAtencao(g) })));
      setTemCusto(comCusto);
      setNomeArquivo(arquivo.name);
      setErros({});
      setEtapa('conferir');
    } catch (falha) {
      setErro(falha instanceof ErroDePlanilha ? falha.message : 'Não consegui ler essa planilha. Tente de novo ou use o modelo do Organiza+.');
      setEtapa('arquivo');
    }
  }

  function escolher(indice, valor) {
    setGrupos((lista) => lista.map((g, i) => (i === indice ? { ...g, escolha: valor } : g)));
    setErros((atual) => {
      if (!atual[indice]) return atual;
      const resto = { ...atual };
      delete resto[indice];
      return resto;
    });
  }

  function mudar(indice, ocorrencia, campo, valor) {
    setGrupos((lista) =>
      lista.map((g, i) =>
        i === indice
          ? {
              ...g,
              ocorrencias: g.ocorrencias.map((o, j) =>
                j === ocorrencia ? { ...o, [campo]: valor, ...(campo === 'vaiParaCozinha' ? { cozinhaAdivinhada: false } : {}) } : o,
              ),
            }
          : g,
      ),
    );
  }

  function outraPlanilha() {
    setGrupos([]);
    setErros({});
    setErro('');
    setEtapa('arquivo');
  }

  function validar() {
    const encontrados = {};
    // Nomes dos produtos que vão ser criados: não pode repetir entre eles nem
    // com o que já está no cardápio (senão um deles não entraria).
    const noCardapio = new Set(produtos.map((p) => chaveDoNome(p.nome)));
    const vistos = new Map();
    grupos.forEach((g, i) => {
      if (g.escolha === null) {
        encontrados[i] = { escolha: 'Escolha qual linha vale.' };
        return;
      }
      if (typeof g.escolha !== 'number') return;
      const item = g.ocorrencias[g.escolha];
      const doItem = errosDoItem(item, { exigirNome: !g.existente });
      if (!g.existente && !doItem.nome) {
        const chave = chaveDoNome(item.nome);
        if (noCardapio.has(chave)) doItem.nome = 'Já existe um produto com esse nome no cardápio.';
        else if (vistos.has(chave)) doItem.nome = `Esse nome já está na linha ${vistos.get(chave)}.`;
        else vistos.set(chave, item.linha);
      }
      if (Object.keys(doItem).length) encontrados[i] = doItem;
    });
    return encontrados;
  }

  function focarPrimeiroErro(encontrados) {
    const [primeiro] = Object.entries(encontrados);
    if (!primeiro) return;
    const [indice, e] = primeiro;
    const form = formulario.current;
    const alvo = e.escolha
      ? form.querySelector(`[data-escolha="escolha-${indice}"]`)
      : form.elements.namedItem(`${e.nome ? 'nome' : e.preco ? 'preco' : 'custo'}-${indice}`);
    alvo?.focus();
  }

  async function salvar(e) {
    e.preventDefault();
    const encontrados = validar();
    setErros(encontrados);
    if (Object.keys(encontrados).length) {
      focarPrimeiroErro(encontrados);
      return;
    }

    setErro('');
    setEtapa('salvando');
    let criados = 0;
    try {
      // Os novos entram de uma vez: ou todos, ou nenhum.
      if (novos.length) criados = await criarProdutos(negocioId, novos);
    } catch (falha) {
      setErro(`${falha.message} Nada foi salvo. Confira a internet e toque em Salvar de novo.`);
      setEtapa('conferir');
      return;
    }
    const salvos = new Set(novos.map((n) => n.grupo));
    let atualizados = 0;
    for (const a of atualizar) {
      try {
        await atualizarProduto(a.id, a.alteracoes);
      } catch (falha) {
        // O que já entrou sai da lista; o resto fica para tentar de novo.
        setGrupos((lista) => lista.filter((g) => !salvos.has(g.id)));
        setErros({});
        setErro(
          `${falha.message} ${plural(criados, 'produto novo foi salvo', 'produtos novos foram salvos')} e ${plural(atualizados, 'foi atualizado', 'foram atualizados')}. Toque em Salvar para tentar o resto.`,
        );
        setEtapa('conferir');
        return;
      }
      salvos.add(a.grupo);
      atualizados++;
    }
    onImportado({ criados, atualizados, repetidos: novos.length - criados });
  }

  const partes = [];
  if (novos.length) partes.push(plural(novos.length, 'novo', 'novos'));
  if (atualizar.length) partes.push(plural(atualizar.length, 'atualizado', 'atualizados'));

  function renderizar([g, i]) {
    const props = {
      grupo: g,
      indice: i,
      temCusto,
      erros: erros[i],
      desabilitado: salvando,
      onEscolher: (valor) => escolher(i, valor),
      onMudar: (ocorrencia, campo, valor) => mudar(i, ocorrencia, campo, valor),
    };
    return g.existente || g.ocorrencias.length > 1 ? <LinhaComEscolha key={g.id} {...props} /> : <LinhaSimples key={g.id} {...props} />;
  }

  return (
    <section
      aria-labelledby="titulo-importar-planilha"
      className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 sm:p-6 mb-6 flex flex-col gap-4"
      style={{ borderColor: ACCENT }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-importar-planilha" className="text-lg font-semibold text-[var(--text-primary)]">
          Importar planilha
        </h2>
        <button
          type="button"
          onClick={onFechar}
          disabled={salvando}
          aria-label="Fechar sem importar"
          className="w-11 h-11 inline-flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-card-hover)]"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {erro && <Aviso>{erro}</Aviso>}

      {etapa === 'arquivo' && (
        <>
          <p className="text-[var(--text-primary)] leading-relaxed">
            Use o modelo do Organiza+ ou a sua própria planilha: uma coluna com o nome do produto e outra com o preço. Nada é salvo antes de você
            conferir.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Botao variante="secundaria" tamanho="grande" onClick={baixarModelo}>
              <DownloadIcon className="w-5 h-5" />
              Baixar o modelo
            </Botao>
            <input ref={entrada} type="file" accept={ACEITA} onChange={aoEscolherArquivo} className="hidden" />
            <Botao tamanho="grande" cor={ACCENT} onClick={() => entrada.current.click()}>
              <SheetIcon className="w-5 h-5" />
              Escolher a planilha
            </Botao>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Planilha do Excel (.xlsx) ou .csv. No Google Planilhas: Arquivo → Fazer download → Microsoft Excel (.xlsx). A planilha é lida aqui no
            aparelho e não é enviada para ninguém.
          </p>
        </>
      )}

      {etapa === 'lendo' && <Carregando texto="Lendo a planilha…" />}

      {(etapa === 'conferir' || salvando) && (
        <form ref={formulario} onSubmit={salvar} noValidate aria-labelledby="titulo-importar-planilha" className="flex flex-col gap-5">
          <p className="text-[var(--text-primary)]">
            {plural(grupos.length, 'produto encontrado', 'produtos encontrados')} em <strong className="break-all">{nomeArquivo}</strong>.
            {repetidasIguais > 0 && ` ${plural(repetidasIguais, 'linha repetida igual entra', 'linhas repetidas iguais entram')} uma vez só.`}
          </p>

          {atencao.length > 0 && (
            <section aria-labelledby="titulo-atencao" className="flex flex-col gap-3">
              <h3 id="titulo-atencao" className="font-bold text-[var(--text-primary)]">
                Confira estes primeiro ({atencao.length})
              </h3>
              <p className="text-sm text-[var(--text-secondary)] -mt-1">Faltou o preço, o nome se repete ou o produto já está no cardápio.</p>
              <ul className="flex flex-col gap-3">{atencao.map(renderizar)}</ul>
            </section>
          )}

          {prontos.length > 0 && (
            <section aria-labelledby="titulo-prontos" className="flex flex-col gap-3">
              <h3 id="titulo-prontos" className="font-bold text-[var(--text-primary)]">
                Prontos para entrar ({prontos.length})
              </h3>
              <ul className="flex flex-col gap-3">{prontos.map(renderizar)}</ul>
            </section>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Botao type="submit" tamanho="grande" cor={ACCENT} larguraTotal disabled={salvando || partes.length === 0}>
              {salvando ? 'Salvando…' : partes.length ? `Salvar: ${partes.join(' e ')}` : 'Nada marcado para salvar'}
            </Botao>
            <Botao variante="secundaria" tamanho="grande" onClick={outraPlanilha} disabled={salvando}>
              Escolher outra planilha
            </Botao>
          </div>
        </form>
      )}
    </section>
  );
}
