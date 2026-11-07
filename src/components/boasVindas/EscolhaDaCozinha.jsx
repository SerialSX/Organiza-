import { Cartao, GrupoDeCartoes } from './Cartoes';

// valor: true = aparelho próprio na cozinha; false = tudo num aparelho só.
export default function EscolhaDaCozinha({ valor, onMudar, legendaVisivel = false, colunas = 'sm:grid-cols-2' }) {
  return (
    <GrupoDeCartoes legenda="Quem prepara os pedidos fica longe de você?" legendaVisivel={legendaVisivel} colunas={colunas}>
      <Cartao
        nome="aparelho-cozinha"
        valor="sim"
        marcado={valor === true}
        onEscolher={() => onMudar(true)}
        icone="🍳"
        titulo="Sim, quero um aparelho na cozinha"
      >
        <span className="text-sm text-[var(--text-secondary)]">
          Vou deixar um celular ou tablet na cozinha, para quem prepara ver os pedidos.
        </span>
      </Cartao>
      <Cartao
        nome="aparelho-cozinha"
        valor="nao"
        marcado={valor === false}
        onEscolher={() => onMudar(false)}
        icone="🙋"
        titulo="Não, eu mesmo preparo ou a cozinha fica do meu lado"
      >
        <span className="text-sm text-[var(--text-secondary)]">
          Uso só um aparelho. Vejo os pedidos e marco quando ficam prontos na mesma tela.
        </span>
      </Cartao>
    </GrupoDeCartoes>
  );
}
