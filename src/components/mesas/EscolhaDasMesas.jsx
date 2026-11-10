import Contador from './Contador';
import { Cartao, GrupoDeCartoes } from '../boasVindas/Cartoes';
import { MAXIMO_DA_TAXA, MAXIMO_DE_MESAS, TAXA_PADRAO } from '../../lib/mesas';

// Quantas mesas aparecem no mapa de Pedidos.
export function QuantasMesas({ valor, onMudar, rotuloVisivel = false }) {
  return (
    <Contador
      rotulo="Quantas mesas você tem?"
      rotuloVisivel={rotuloVisivel}
      valor={valor}
      onMudar={onMudar}
      min={1}
      max={MAXIMO_DE_MESAS}
      menos="Uma mesa a menos"
      mais="Uma mesa a mais"
    />
  );
}

// taxa: null = ainda não respondeu; 0 = não cobra; 1 a 30 = percentual.
export function TaxaDeServico({ taxa, onMudar, legendaVisivel = false, colunas = 'sm:grid-cols-2' }) {
  const cobra = taxa !== null && taxa > 0;
  return (
    <div className="flex flex-col gap-4">
      <GrupoDeCartoes legenda="Você cobra a taxa de serviço?" legendaVisivel={legendaVisivel} colunas={colunas}>
        <Cartao nome="taxa-servico" valor="nao" marcado={taxa === 0} onEscolher={() => onMudar(0)} icone="🙅" titulo="Não cobro">
          <span className="text-sm text-[var(--text-secondary)]">A conta da mesa é só o que foi consumido.</span>
        </Cartao>
        <Cartao
          nome="taxa-servico"
          valor="sim"
          marcado={cobra}
          onEscolher={() => onMudar(cobra ? taxa : TAXA_PADRAO)}
          icone="🤝"
          titulo="Sim, cobro"
        >
          <span className="text-sm text-[var(--text-secondary)]">
            Ao fechar a mesa, o Organiza+ soma a taxa. Se o cliente não quiser pagar, é só tirar.
          </span>
        </Cartao>
      </GrupoDeCartoes>
      {cobra && (
        <Contador
          rotulo="Quanto é a taxa de serviço (%)"
          rotuloVisivel
          valor={taxa}
          onMudar={onMudar}
          min={1}
          max={MAXIMO_DA_TAXA}
          sufixo="%"
          menos="Diminuir a taxa"
          mais="Aumentar a taxa"
        />
      )}
    </div>
  );
}
