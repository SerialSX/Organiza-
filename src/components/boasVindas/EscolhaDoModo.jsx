import { MODOS } from '../../lib/atendimento';
import { Cartao, GrupoDeCartoes } from './Cartoes';

const ICONES = { balcao: '🧾', mesa: '🍢', balcao_e_mesa: '🔀' };

export default function EscolhaDoModo({ valor, onMudar, legendaVisivel = false, colunas = 'md:grid-cols-3' }) {
  return (
    <GrupoDeCartoes legenda="Como você atende seus clientes?" legendaVisivel={legendaVisivel} colunas={colunas}>
      {MODOS.map((m) => (
        <Cartao
          key={m.id}
          nome="modo-atendimento"
          valor={m.id}
          marcado={valor === m.id}
          onEscolher={() => onMudar(m.id)}
          icone={ICONES[m.id]}
          titulo={m.rotulo}
        >
          <span className="font-semibold text-[var(--text-primary)]">{m.titulo}</span>
          <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] flex flex-col gap-1">
            {m.passos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          <span className="mt-auto pt-1 text-sm italic text-[var(--text-secondary)]">Parecido com: {m.exemplo}.</span>
        </Cartao>
      ))}
    </GrupoDeCartoes>
  );
}
