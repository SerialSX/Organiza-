import { useState } from 'react';
import Botao from '../ui/Botao';
import Janela from './Janela';
import FecharMesa from './FecharMesa';
import PassarMesa from './PassarMesa';
import { MoneyIcon, SendIcon } from '../icons/AppIcons';
import { totalDoPedido } from '../../lib/caixa';
import { rotuloDaMesa } from '../../lib/mesas';
import { formatarHora, formatarMoeda, numeroDoPedido } from '../../lib/formatadores';
import { STATUS } from '../../lib/pedidoStatus';

const LARANJA = 'var(--color-brand-orange)';
const VERDE = 'var(--color-accent-relatorios)';

function resumoDosItens(pedido) {
  return pedido.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ');
}

// Conta de uma mesa ocupada: o que já foi pedido e o total, e as três ações
// (lançar mais, fechar a mesa, passar para outra mesa).
export default function ContaDaMesa({ mesa, mapa, taxa, onLancarMais, onConcluido, onFechar }) {
  const [tela, setTela] = useState('conta'); // conta | fechar | passar
  const titulo =
    tela === 'fechar' ? `Fechar a ${rotuloDaMesa(mesa)}` : tela === 'passar' ? `Passar a ${rotuloDaMesa(mesa)}` : rotuloDaMesa(mesa);

  return (
    <Janela titulo={titulo} idTitulo="titulo-conta-da-mesa" onFechar={onFechar}>
      {tela === 'conta' && (
        <>
          <ul className="flex flex-col divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] px-4">
            {mesa.pedidos.map((p) => (
              <li key={p.id} className="py-3 flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-bold tabular-nums text-[var(--text-primary)]">{numeroDoPedido(p)}</span>
                  <span className="text-sm tabular-nums text-[var(--text-secondary)]">{formatarHora(p.criado_em)}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {STATUS[p.status]?.rotulo}
                  </span>
                  <span className="ml-auto font-semibold tabular-nums text-[var(--text-primary)]">{formatarMoeda(totalDoPedido(p))}</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] break-words">{resumoDosItens(p)}</p>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[var(--text-secondary)]">Consumo até agora</span>
            <span className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatarMoeda(mesa.total)}</span>
          </div>
          <div className="flex flex-col gap-2">
            <Botao cor={LARANJA} tamanho="grande" larguraTotal onClick={() => onLancarMais(mesa)}>
              <SendIcon className="w-5 h-5" />
              Lançar mais nesta mesa
            </Botao>
            <Botao cor={VERDE} tamanho="grande" larguraTotal onClick={() => setTela('fechar')}>
              <MoneyIcon className="w-5 h-5" />
              Fechar mesa
            </Botao>
            <Botao variante="secundaria" tamanho="grande" larguraTotal onClick={() => setTela('passar')}>
              Passar para outra mesa
            </Botao>
          </div>
        </>
      )}
      {tela === 'fechar' && <FecharMesa mesa={mesa} taxa={taxa} onFechada={onConcluido} onVoltar={() => setTela('conta')} />}
      {tela === 'passar' && <PassarMesa mesa={mesa} mapa={mapa} onPassada={onConcluido} onVoltar={() => setTela('conta')} />}
    </Janela>
  );
}
