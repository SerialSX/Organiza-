import { useState } from 'react';
import Janela from '../mesas/Janela';
import Botao from '../ui/Botao';
import Aviso from '../ui/Aviso';
import { formatarMoeda } from '../../lib/formatadores';
import {
  ehFixa,
  escolhaDaOpcao,
  metadesCombinam,
  nomeDaOpcao,
  nomeDaParte,
  opcaoDisponivel,
  opcaoNoCardapio,
  parteAceitaMeioAMeio,
  precoDoCombo,
} from '../../lib/combos';

const ACCENT = 'var(--color-accent-pedidos)';

function BotaoDaOpcao({ opcao, porId, escolhida, bloqueada, onTocar }) {
  const disponivel = opcaoDisponivel(opcao, porId);
  const nome = nomeDaOpcao(opcao, porId);
  const acrescimo = opcao.acrescimo > 0 ? formatarMoeda(opcao.acrescimo) : '';
  const fora = !disponivel || bloqueada;
  return (
    <button
      type="button"
      aria-pressed={escolhida}
      aria-disabled={fora || undefined}
      aria-label={!disponivel ? `${nome}, esgotado` : `${nome}${acrescimo ? `, mais ${acrescimo}` : ''}`}
      onClick={onTocar}
      className="w-full min-h-14 rounded-xl border-2 px-4 py-2 flex items-center justify-between gap-3 text-left transition-transform active:scale-[0.98] aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      style={{ borderColor: escolhida ? ACCENT : 'var(--border-subtle)', backgroundColor: escolhida ? 'color-mix(in srgb, var(--color-accent-pedidos) 14%, transparent)' : undefined }}
    >
      <span className={`font-semibold break-words min-w-0 ${disponivel ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
        <span className={disponivel ? undefined : 'line-through'}>{nome}</span>
        {!disponivel && <span className="font-normal"> · Esgotado</span>}
      </span>
      {acrescimo && (
        <span className={`shrink-0 font-bold tabular-nums ${disponivel ? 'text-[var(--text-primary)]' : 'line-through text-[var(--text-secondary)]'}`}>
          +{acrescimo}
        </span>
      )}
    </button>
  );
}

// Escolhe as partes à escolha do combo (a bebida, o sabor da pizza; meio a
// meio quando a parte tem dois sabores que combinam). As fixas já vêm. A
// opção esgotada aparece riscada e, tocada, avisa ali mesmo.
// precoBase: o preço do combo agora (o da promoção, se tiver).
// onEscolher(escolhas): [{ produtoId, tamanhoId, segundoId }] na ordem das partes.
// onToqueEsgotado(produto): conta a venda que teria saído errada.
export default function EscolherCombo({ combo, porId, precoBase, onEscolher, onToqueEsgotado, onFechar }) {
  // Por parte: as opções tocadas (uma; duas no meio a meio) e se é meio a meio.
  const [tocadas, setTocadas] = useState(() => combo.partes.map((p) => (ehFixa(p) ? [p.opcoes[0]] : [])));
  const [meio, setMeio] = useState(() => combo.partes.map(() => false));
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const idTitulo = `combo-${combo.id}`;

  const escolhas = combo.partes.map((parte, i) => {
    const [primeira, segunda] = tocadas[i];
    if (!primeira || (meio[i] && !segunda)) return null;
    return escolhaDaOpcao(primeira, meio[i] ? segunda : null);
  });
  const total = precoDoCombo(precoBase, combo, escolhas, porId);
  const fixas = combo.partes.filter(ehFixa).map((p) => nomeDaOpcao(p.opcoes[0], porId));

  function tocar(i, opcao) {
    setErro('');
    setAviso('');
    if (!opcaoDisponivel(opcao, porId)) {
      const produto = porId[opcao.produto_id];
      setAviso(`${nomeDaOpcao(opcao, porId)} está esgotado. Ofereça outra opção ao cliente.`);
      if (produto) onToqueEsgotado?.(produto);
      return;
    }
    const [primeira, segunda] = tocadas[i];
    if (meio[i] && primeira && primeira.id !== opcao.id && segunda?.id !== opcao.id && !metadesCombinam(primeira, opcao, porId)) {
      setErro(`${nomeDaOpcao(opcao, porId)} não combina com ${nomeDaOpcao(primeira, porId)} no meio a meio.`);
      return;
    }
    setTocadas((todas) =>
      todas.map((atual, j) => {
        if (j !== i) return atual;
        if (!meio[i]) return [opcao];
        if (atual[0]?.id === opcao.id) return atual.slice(1);
        if (atual[1]?.id === opcao.id) return [atual[0]];
        if (!atual[0]) return [opcao];
        if (!metadesCombinam(atual[0], opcao, porId)) return atual;
        return [atual[0], opcao];
      }),
    );
  }

  function mudarMeio(i, ligado) {
    setErro('');
    setMeio((m) => m.map((v, j) => (j === i ? ligado : v)));
    setTocadas((todas) => todas.map((atual, j) => (j === i ? atual.slice(0, 1) : atual)));
  }

  function adicionar() {
    const falta = combo.partes.findIndex((_, i) => !escolhas[i]);
    if (falta >= 0) {
      const parte = combo.partes[falta];
      setErro(meio[falta] && tocadas[falta].length ? `Escolha o outro sabor de ${nomeDaParte(parte, falta)}.` : `Escolha: ${nomeDaParte(parte, falta)}.`);
      return;
    }
    onEscolher(escolhas);
  }

  return (
    <Janela titulo={combo.nome} idTitulo={idTitulo} onFechar={onFechar}>
      {fixas.length > 0 && (
        <p className="text-base text-[var(--text-secondary)] break-words">
          Já vem: <span className="text-[var(--text-primary)]">{fixas.join(', ')}</span>
        </p>
      )}

      {combo.partes.map((parte, i) => {
        if (ehFixa(parte)) return null;
        const comMeio = parteAceitaMeioAMeio(parte, porId);
        const [primeira] = tocadas[i];
        const titulo = nomeDaParte(parte, i);
        return (
          <fieldset key={parte.id} className="flex flex-col gap-2 min-w-0">
            <legend className="mb-2 text-lg font-bold text-[var(--text-primary)]">
              {titulo}
              {meio[i] ? ': dois sabores' : ''}
            </legend>
            {comMeio && (
              <label className="flex min-h-11 items-center gap-3 text-base font-medium text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={meio[i]}
                  onChange={(e) => mudarMeio(i, e.target.checked)}
                  className="w-5 h-5 accent-[var(--color-accent-pedidos)]"
                />
                Meio a meio
              </label>
            )}
            <ul className="flex flex-col gap-2">
              {parte.opcoes
                .filter((o) => opcaoNoCardapio(o, porId))
                .map((opcao) => {
                  const escolhida = tocadas[i].some((t) => t.id === opcao.id);
                  // No meio a meio, depois do primeiro sabor só os que combinam com ele.
                  const bloqueada = meio[i] && primeira && !escolhida && !metadesCombinam(primeira, opcao, porId);
                  return (
                    <li key={opcao.id}>
                      <BotaoDaOpcao opcao={opcao} porId={porId} escolhida={escolhida} bloqueada={bloqueada} onTocar={() => tocar(i, opcao)} />
                    </li>
                  );
                })}
            </ul>
          </fieldset>
        );
      })}

      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {aviso && <Aviso tipo="info">{aviso}</Aviso>}
        {erro && <Aviso>{erro}</Aviso>}
      </div>

      <Botao cor={ACCENT} tamanho="grande" larguraTotal onClick={adicionar}>
        Adicionar {combo.nome}, {formatarMoeda(total)}
      </Botao>
    </Janela>
  );
}
