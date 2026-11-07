import { useId, useState } from 'react';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import Contador from './Contador';
import { classeCampo } from '../ui/Campo';
import { FORMAS_DE_PAGAMENTO } from '../../services/pedidos';
import { fecharContaMesa } from '../../services/mesas';
import { totalDoPedido } from '../../lib/caixa';
import { dividirIgual, emCentavos, emReais, faltaAnotar, rotuloDaMesa, servicoEmCentavos } from '../../lib/mesas';
import { formatarHora, formatarMoeda, lerValor, numeroDoPedido } from '../../lib/formatadores';

const VERDE = 'var(--color-accent-relatorios)';
const CHAVE_DICA_SEPARADO = 'organiza-dica-pago-separado';
const MAXIMO_DE_PARTES = 30;

const JEITOS = [
  { id: 'um_pagou', titulo: 'Um pagou tudo', texto: 'Uma pessoa pagou a conta inteira.' },
  { id: 'dividiram', titulo: 'Dividiram, e quero anotar cada parte', texto: 'Cada um pagou um pedaço, e você anota como.' },
  { id: 'separado', titulo: 'Pagaram separado (sem anotar)', texto: 'Cada um pagou o seu e ninguém anotou a forma.' },
];

function reais(centavos) {
  return formatarMoeda(emReais(centavos));
}

function viuDica() {
  try {
    return localStorage.getItem(CHAVE_DICA_SEPARADO) === '1';
  } catch {
    return false;
  }
}

function guardarDicaVista() {
  try {
    localStorage.setItem(CHAVE_DICA_SEPARADO, '1');
  } catch {
    // sem localStorage: a dica volta na próxima vez, sem problema
  }
}

const chip =
  'cursor-pointer rounded-xl border-2 px-3 min-h-11 inline-flex items-center justify-center text-sm font-semibold transition-colors has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--cor-foco)]';

// Pix / Dinheiro / Crédito / Débito como escolha (rádio), para cada parte.
function EscolhaDeForma({ legenda, valor, onMudar, desabilitado }) {
  const nome = useId();
  return (
    <fieldset className="flex flex-col gap-1.5 min-w-0" disabled={desabilitado}>
      <legend className="text-sm font-medium text-[var(--text-secondary)] mb-1">{legenda}</legend>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FORMAS_DE_PAGAMENTO.map((f) => {
          const marcado = valor === f.id;
          return (
            <label
              key={f.id}
              className={chip}
              style={{
                borderColor: marcado ? VERDE : 'var(--border-subtle)',
                backgroundColor: marcado ? `color-mix(in srgb, ${VERDE} 18%, transparent)` : 'transparent',
              }}
            >
              <input type="radio" name={nome} value={f.id} checked={marcado} onChange={() => onMudar(f.id)} className="sr-only" />
              {marcado && <span aria-hidden="true">✓&nbsp;</span>}
              {f.rotulo}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Linha({ rotulo, valor, forte = false, className = '', children }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <dt className={`flex-1 min-w-0 ${forte ? 'text-lg font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{rotulo}</dt>
      <dd className={`tabular-nums ${forte ? 'text-2xl font-extrabold text-[var(--text-primary)]' : 'font-semibold text-[var(--text-primary)]'}`}>
        {valor}
      </dd>
      {children && <dd className="basis-full">{children}</dd>}
    </div>
  );
}

let proximaChave = 1;
const novaParte = () => ({ chave: proximaChave++, texto: '', forma: null });

// Fecha a conta da mesa: consumo, serviço (o cliente pode não querer pagar) e
// como pagaram. O banco recalcula tudo e recusa se a soma não bater.
export default function FecharMesa({ mesa, taxa, onFechada, onVoltar }) {
  const [desmarcados, setDesmarcados] = useState(() => new Set());
  const [cobrar, setCobrar] = useState(taxa > 0);
  const [jeito, setJeito] = useState(null);
  const [divisao, setDivisao] = useState('igual');
  const [pessoas, setPessoas] = useState(2);
  const [formasIguais, setFormasIguais] = useState([]);
  const [partes, setPartes] = useState(() => [novaParte(), novaParte()]);
  const [dicaSeparado, setDicaSeparado] = useState(() => !viuDica());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const nomeJeito = useId();

  const marcados = mesa.pedidos.filter((p) => !desmarcados.has(p.id));
  const varios = mesa.pedidos.length > 1;
  const consumo = marcados.reduce((s, p) => s + emCentavos(totalDoPedido(p)), 0);
  const servico = cobrar ? servicoEmCentavos(consumo, taxa) : 0;
  const total = consumo + servico;

  const valoresIguais = dividirIgual(total, pessoas);
  const partesLidas = partes.map((p) => {
    const valor = lerValor(p.texto);
    return { ...p, centavos: Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 100) : null };
  });
  const falta = faltaAnotar(total, partesLidas);

  function mexer(atualizar) {
    setErro('');
    atualizar();
  }

  function alternar(id) {
    mexer(() =>
      setDesmarcados((atual) => {
        const novo = new Set(atual);
        if (novo.has(id)) novo.delete(id);
        else novo.add(id);
        return novo;
      }),
    );
  }

  function mudarParte(chave, mudanca) {
    mexer(() => setPartes((atual) => atual.map((p) => (p.chave === chave ? { ...p, ...mudanca } : p))));
  }

  // O que vai para o banco, ou o motivo de ainda não dar para fechar.
  function pagamentos() {
    if (jeito === 'separado') return { lista: [] };
    if (jeito === 'dividiram' && divisao === 'igual') {
      if (valoresIguais.some((_, i) => !formasIguais[i])) return { falta: 'Escolha como cada pessoa pagou.' };
      return { lista: valoresIguais.map((centavos, i) => ({ forma: formasIguais[i], centavos })) };
    }
    if (jeito === 'dividiram') {
      const usadas = partesLidas.filter((p) => p.texto.trim() || p.forma);
      if (!usadas.length) return { falta: 'Anote quanto cada um pagou.' };
      if (usadas.some((p) => p.centavos === null || p.centavos === 0)) return { falta: 'Confira o valor de cada parte.' };
      if (usadas.some((p) => !p.forma)) return { falta: 'Escolha como cada parte foi paga.' };
      if (falta !== 0) return { falta: falta > 0 ? `Ainda falta anotar ${reais(falta)}.` : `Passou ${reais(-falta)} do total.` };
      return { lista: usadas.map((p) => ({ forma: p.forma, centavos: p.centavos })) };
    }
    return { falta: 'Escolha como pagaram.' };
  }

  async function fechar(lista) {
    if (!marcados.length || salvando) return;
    setSalvando(true);
    setErro('');
    try {
      await fecharContaMesa(
        marcados.map((p) => p.id),
        { jeito, cobrarServico: servico > 0, pagamentos: lista },
      );
      const sobra = mesa.pedidos.length - marcados.length;
      onFechada(
        `${rotuloDaMesa(mesa)}: conta de ${reais(total)} recebida.${
          sobra ? ` ${sobra === 1 ? 'Ficou 1 pedido aberto' : `Ficaram ${sobra} pedidos abertos`} na mesa.` : ' A mesa está livre.'
        }`,
      );
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  const pronto = pagamentos();

  return (
    <div className="flex flex-col gap-5">
      {varios && (
        <fieldset className="flex flex-col gap-1" disabled={salvando}>
          <legend className="text-sm text-[var(--text-secondary)] mb-1">Desmarque o pedido que não é de quem está pagando.</legend>
          {mesa.pedidos.map((p) => (
            <label
              key={p.id}
              className="min-h-12 flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] px-3 py-2 cursor-pointer"
            >
              <input
                type="checkbox"
                className="w-5 h-5 shrink-0 accent-[var(--color-accent-relatorios)]"
                checked={!desmarcados.has(p.id)}
                onChange={() => alternar(p.id)}
              />
              <span className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3">
                <span className="font-bold tabular-nums text-[var(--text-primary)]">{numeroDoPedido(p)}</span>
                <span className="text-sm tabular-nums text-[var(--text-secondary)]">{formatarHora(p.criado_em)}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-[var(--text-primary)]">{formatarMoeda(totalDoPedido(p))}</span>
            </label>
          ))}
        </fieldset>
      )}

      <dl className="flex flex-col gap-2 rounded-2xl border border-[var(--border-subtle)] p-4" aria-live="polite">
        <Linha rotulo="Consumo" valor={reais(consumo)} />
        {taxa > 0 && (
          <Linha rotulo={cobrar ? `Serviço (${taxa}%)` : 'Serviço'} valor={cobrar ? reais(servico) : 'Não cobrado'}>
            <Botao variante="texto" className="!min-h-9 !px-0" onClick={() => mexer(() => setCobrar((c) => !c))} disabled={salvando}>
              {cobrar ? 'Cliente não quis pagar o serviço' : 'Cobrar o serviço de novo'}
            </Botao>
          </Linha>
        )}
        <Linha rotulo="Total" valor={reais(total)} forte className="border-t border-[var(--border-subtle)] pt-2" />
      </dl>

      {marcados.length === 0 ? (
        <Aviso tipo="info">Marque pelo menos um pedido.</Aviso>
      ) : (
        <fieldset className="flex flex-col gap-2" disabled={salvando}>
          <legend className="text-lg font-bold text-[var(--text-primary)] mb-2">Como pagaram?</legend>
          {JEITOS.map((j) => {
            const marcado = jeito === j.id;
            return (
              <label
                key={j.id}
                className="cursor-pointer rounded-2xl border-2 px-4 py-3 flex flex-col transition-colors hover:border-[var(--color-accent-relatorios)] has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--cor-foco)]"
                style={{
                  borderColor: marcado ? VERDE : 'var(--border-subtle)',
                  backgroundColor: marcado ? `color-mix(in srgb, ${VERDE} 12%, var(--surface-card))` : 'transparent',
                }}
              >
                <input type="radio" name={nomeJeito} value={j.id} checked={marcado} onChange={() => mexer(() => setJeito(j.id))} className="sr-only" />
                <span className="font-bold text-[var(--text-primary)]">
                  {marcado && <span aria-hidden="true">✓ </span>}
                  {j.titulo}
                </span>
                <span className="text-sm text-[var(--text-secondary)]">{j.texto}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {marcados.length > 0 && jeito === 'um_pagou' && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-[var(--text-primary)]">Como o cliente pagou {reais(total)}? Toque para receber.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label={`Receber ${reais(total)}`}>
            {FORMAS_DE_PAGAMENTO.map((f) => (
              <Botao key={f.id} cor={VERDE} tamanho="grande" disabled={salvando} onClick={() => fechar([{ forma: f.id, centavos: total }])}>
                {f.rotulo}
              </Botao>
            ))}
          </div>
        </div>
      )}

      {marcados.length > 0 && jeito === 'dividiram' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Como dividiram">
            {[
              ['igual', 'Dividir igual'],
              ['valor', 'Cada um um valor'],
            ].map(([id, rotulo]) => (
              <Botao
                key={id}
                variante={divisao === id ? 'primaria' : 'secundaria'}
                cor={VERDE}
                aria-pressed={divisao === id}
                onClick={() => mexer(() => setDivisao(id))}
                disabled={salvando}
              >
                {rotulo}
              </Botao>
            ))}
          </div>

          {divisao === 'igual' ? (
            <div className="flex flex-col gap-4">
              <Contador
                rotulo="Quantas pessoas vão pagar"
                rotuloVisivel
                valor={pessoas}
                onMudar={(n) => mexer(() => setPessoas(n))}
                min={2}
                max={MAXIMO_DE_PARTES}
                menos="Uma pessoa a menos"
                mais="Uma pessoa a mais"
              />
              <ol className="flex flex-col gap-3">
                {valoresIguais.map((centavos, i) => (
                  <li key={i} className="rounded-2xl border border-[var(--border-subtle)] p-3 flex flex-col gap-2">
                    <p className="font-bold tabular-nums text-[var(--text-primary)]">
                      Pessoa {i + 1}: {reais(centavos)}
                    </p>
                    <EscolhaDeForma
                      legenda={`Como a pessoa ${i + 1} pagou?`}
                      valor={formasIguais[i] ?? null}
                      desabilitado={salvando}
                      onMudar={(forma) =>
                        mexer(() =>
                          setFormasIguais((atual) => {
                            const novo = [...atual];
                            novo[i] = forma;
                            return novo;
                          }),
                        )
                      }
                    />
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <ol className="flex flex-col gap-3">
                {partesLidas.map((p, i) => (
                  <li key={p.chave} className="rounded-2xl border border-[var(--border-subtle)] p-3 flex flex-col gap-2">
                    <div className="flex items-end gap-2">
                      <div className="flex-1 flex flex-col gap-1.5">
                        <label htmlFor={`parte-${p.chave}`} className="text-sm font-medium text-[var(--text-secondary)]">
                          Valor da parte {i + 1}
                        </label>
                        <input
                          id={`parte-${p.chave}`}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0,00"
                          value={p.texto}
                          onChange={(e) => mudarParte(p.chave, { texto: e.target.value })}
                          disabled={salvando}
                          className={classeCampo}
                        />
                      </div>
                      {partes.length > 1 && (
                        <Botao
                          variante="secundaria"
                          className="min-h-12"
                          onClick={() => mexer(() => setPartes((atual) => atual.filter((x) => x.chave !== p.chave)))}
                          disabled={salvando}
                          aria-label={`Tirar a parte ${i + 1}`}
                        >
                          Tirar
                        </Botao>
                      )}
                    </div>
                    <EscolhaDeForma
                      legenda={`Como a parte ${i + 1} foi paga?`}
                      valor={p.forma}
                      desabilitado={salvando}
                      onMudar={(forma) => mudarParte(p.chave, { forma })}
                    />
                  </li>
                ))}
              </ol>
              {partes.length < MAXIMO_DE_PARTES && (
                <Botao variante="secundaria" className="self-start" onClick={() => mexer(() => setPartes((a) => [...a, novaParte()]))} disabled={salvando}>
                  + Outra parte
                </Botao>
              )}
              <p
                className={`text-lg font-bold tabular-nums ${falta === 0 ? 'text-[var(--texto-relatorios)]' : 'text-[var(--texto-laranja)]'}`}
                aria-live="polite"
              >
                {falta === 0 ? 'Falta R$ 0,00: bateu com o total.' : falta > 0 ? `Falta ${reais(falta)}` : `Passou ${reais(-falta)} do total`}
              </p>
            </div>
          )}
        </div>
      )}

      {marcados.length > 0 && jeito === 'separado' && (
        <div className="flex flex-col gap-3">
          {dicaSeparado && (
            <Aviso tipo="info">
              <span className="flex flex-col gap-2">
                <span>
                  Use quando cada um pagou o seu e ninguém anotou se foi Pix, dinheiro ou cartão. A conta fica paga e, no Caixa,
                  entra numa linha <strong>“Pago separado, sem detalhe”</strong>.
                </span>
                <button
                  type="button"
                  className="self-start font-semibold underline underline-offset-4"
                  onClick={() => {
                    guardarDicaVista();
                    setDicaSeparado(false);
                  }}
                >
                  Entendi, não mostrar de novo
                </button>
              </span>
            </Aviso>
          )}
        </div>
      )}

      {erro && <Aviso>{erro}</Aviso>}

      {marcados.length > 0 && jeito && jeito !== 'um_pagou' && (
        <div className="flex flex-col gap-2">
          {pronto.falta && <p className="text-sm font-semibold text-[var(--text-secondary)]">{pronto.falta}</p>}
          <Botao cor={VERDE} tamanho="grande" larguraTotal disabled={salvando || Boolean(pronto.falta)} onClick={() => fechar(pronto.lista)}>
            {salvando ? 'Fechando…' : `Fechar a conta: ${reais(total)}`}
          </Botao>
        </div>
      )}

      <Botao variante="secundaria" onClick={onVoltar} disabled={salvando} className="self-start">
        ← Voltar
      </Botao>
    </div>
  );
}
