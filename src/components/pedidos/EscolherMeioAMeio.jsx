import { useState } from 'react';
import Janela from '../mesas/Janela';
import Botao from '../ui/Botao';
import EscolhaDaRegraMeioAMeio from '../produtos/EscolhaDaRegraMeioAMeio';
import { useAuth } from '../../context/useAuth';
import { formatarMoeda } from '../../lib/formatadores';
import { tamanhoDisponivel } from '../../lib/tamanhos';
import { nomeDoItem, precoMeioAMeio, saboresParaCombinar } from '../../lib/meioAMeio';

const ACCENT = 'var(--color-accent-pedidos)';

// O dono marcou sabores, mas ainda não disse como cobra (cardápio pronto ou
// planilha). O dono escolhe aqui mesmo; a equipe é avisada para chamar o dono.
function SemRegra({ ehDono }) {
  const { configurarMeioAMeio } = useAuth();
  const [regra, setRegra] = useState(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (!ehDono) {
    return (
      <p className="text-base text-[var(--text-secondary)]">
        O dono ainda não escolheu como cobrar o meio a meio. Peça para ele escolher em Minha conta.
      </p>
    );
  }

  async function salvar(e) {
    e.preventDefault();
    if (!regra) {
      setErro('Escolha como você cobra o meio a meio.');
      return;
    }
    setSalvando(true);
    const { erro: falha } = await configurarMeioAMeio(regra);
    setSalvando(false);
    if (falha) setErro(falha);
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <EscolhaDaRegraMeioAMeio
        valor={regra}
        onMudar={setRegra}
        erro={erro}
        texto="Escolha uma vez e vale para todos os sabores. Dá para mudar depois em Minha conta."
      />
      <Botao type="submit" cor={ACCENT} disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar e continuar'}
      </Botao>
    </form>
  );
}

// Meio a meio: escolhe o tamanho (quando tem) e o segundo sabor, entre os
// marcados que têm o mesmo tamanho. Sabor esgotado aparece riscado e, tocado,
// avisa (como na grade). onEscolher(tamanho | null, segundoProduto).
export default function EscolherMeioAMeio({ produto, produtos, regra, ehDono, onEscolher, onEsgotado, onFechar }) {
  const comTamanhos = produto.tamanhos.length > 0;
  // Tamanhos com pelo menos um outro sabor do mesmo tamanho.
  const tamanhos = produto.tamanhos.filter((t) => saboresParaCombinar(produtos, produto, t).length > 0);
  const [tamanho, setTamanho] = useState(() => (comTamanhos && tamanhos.length === 1 && tamanhoDisponivel(produto, tamanhos[0]) ? tamanhos[0] : null));
  const idTitulo = `meio-${produto.id}`;
  const escolhendoSabor = !comTamanhos || tamanho;
  const sabores = escolhendoSabor ? saboresParaCombinar(produtos, produto, tamanho) : [];
  const precoDoPrimeiro = tamanho ? tamanho.preco : produto.preco;

  return (
    <Janela titulo={`${produto.nome} meio a meio`} idTitulo={idTitulo} onFechar={onFechar}>
      {!regra ? (
        <SemRegra ehDono={ehDono} />
      ) : !escolhendoSabor ? (
        <div className="flex flex-col gap-3">
          <p className="text-base text-[var(--text-secondary)]">Qual tamanho? Os dois sabores saem no mesmo tamanho.</p>
          <div role="group" aria-label="Tamanho" className="flex flex-wrap gap-2">
            {tamanhos.map((t) => {
              const disponivel = tamanhoDisponivel(produto, t);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-disabled={!disponivel || undefined}
                  aria-label={disponivel ? `Tamanho ${t.nome}` : `${produto.nome} ${t.nome}, esgotado`}
                  onClick={() => (disponivel ? setTamanho(t) : onEsgotado(produto, t))}
                  className="flex-1 min-w-[5.5rem] min-h-16 rounded-xl border-2 border-[var(--border-subtle)] px-3 py-2 text-xl font-bold text-[var(--text-primary)] transition-transform active:scale-[0.97] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:line-through"
                >
                  {t.nome}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-base text-[var(--text-secondary)]">
            {tamanho ? (
              <>
                Tamanho <strong className="text-[var(--text-primary)]">{tamanho.nome}</strong>. Qual é a outra metade?
              </>
            ) : (
              'Qual é a outra metade?'
            )}
          </p>
          {sabores.length === 0 ? (
            <p className="text-base text-[var(--text-secondary)]">
              Nenhum outro sabor marcado como meio a meio tem este tamanho. Marque os sabores em Produtos.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sabores.map(({ produto: segundo, tamanho: doSegundo, preco, disponivel }) => {
                const nome = nomeDoItem(produto.nome, tamanho?.nome ?? null, segundo.nome);
                const valor = precoMeioAMeio(regra, precoDoPrimeiro, preco);
                return (
                  <li key={segundo.id}>
                    <button
                      type="button"
                      aria-disabled={!disponivel || undefined}
                      aria-label={disponivel ? `Adicionar ${nome}, ${formatarMoeda(valor)}` : `${segundo.nome}${tamanho ? ` ${tamanho.nome}` : ''}, esgotado`}
                      onClick={() => (disponivel ? onEscolher(tamanho, segundo) : onEsgotado(segundo, doSegundo))}
                      className="w-full min-h-14 rounded-xl border-2 border-[var(--border-subtle)] px-4 py-2 flex items-center justify-between gap-3 text-left transition-transform active:scale-[0.98] aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                    >
                      <span className={`font-semibold break-words min-w-0 ${disponivel ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                        <span className={disponivel ? undefined : 'line-through'}>½ {segundo.nome}</span>
                        {!disponivel && <span className="font-normal"> · Esgotado</span>}
                      </span>
                      <span className={`shrink-0 font-bold tabular-nums ${disponivel ? 'text-[var(--texto-pedidos)]' : 'line-through text-[var(--text-secondary)]'}`}>
                        {formatarMoeda(valor)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {comTamanhos && tamanhos.length > 1 && (
            <Botao variante="secundaria" onClick={() => setTamanho(null)}>
              Trocar o tamanho
            </Botao>
          )}
        </div>
      )}
    </Janela>
  );
}
