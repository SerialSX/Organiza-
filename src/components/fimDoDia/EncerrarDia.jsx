import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import Janela from '../mesas/Janela';
import { CheckIcon } from '../icons/AppIcons';
import { encerrarDia } from '../../services/fimDoDia';
import { formatarHora } from '../../lib/formatadores';
import { diaEncerrado, enderecoParaResolver, pendenciasDoDia, quantosPedidos } from '../../lib/fimDoDia';

const VERDE = 'var(--color-accent-relatorios)';
const LARANJA = 'var(--color-brand-orange)';
const dataLonga = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

// "Encerrar o dia" no Caixa. Só encerra com tudo entregue e recebido; senão
// leva para Pedidos com a lista do que resolver. Encerrado, o Caixa embaixo é
// o resumo da noite.
// ehHoje: o dia de trabalho de agora. Dia anterior sem encerrar aparece
// como "não fechado".
export default function EncerrarDia({ dia, pedidos, encerramento, ehHoje, onEncerrado }) {
  const navigate = useNavigate();
  const [janela, setJanela] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const encerrado = diaEncerrado(encerramento, pedidos);
  const abertos = pendenciasDoDia(pedidos).total;
  const nomeDoDia = ehHoje ? 'o dia de hoje' : `o dia ${dataLonga.format(new Date(`${dia}T12:00:00Z`))}`;

  async function encerrar() {
    setSalvando(true);
    setErro('');
    try {
      await encerrarDia(dia);
      setJanela(false);
      onEncerrado();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  function abrir() {
    setErro('');
    setJanela(true);
  }

  if (encerrado) {
    return (
      <section
        aria-labelledby="titulo-dia-encerrado"
        className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 flex items-start gap-3"
        style={{ borderColor: VERDE }}
      >
        <CheckIcon className="w-6 h-6 shrink-0 text-[var(--texto-relatorios)]" />
        <div className="min-w-0">
          <h2 id="titulo-dia-encerrado" className="text-lg font-bold text-[var(--text-primary)]">
            Dia encerrado às {formatarHora(encerramento.encerrado_em)}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Abaixo está o resumo da noite. Se entrar um pedido novo neste dia, ele reabre sozinho.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="titulo-encerrar-dia"
      className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 flex flex-col gap-3"
      style={{ borderColor: ehHoje ? 'var(--border-subtle)' : LARANJA }}
    >
      <div>
        <h2 id="titulo-encerrar-dia" className="text-lg font-bold text-[var(--text-primary)]">
          {ehHoje ? 'Terminou o expediente?' : 'Caixa não fechado'}
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {abertos > 0
            ? `${abertos === 1 ? '1 pedido está' : `${quantosPedidos(abertos)} estão`} em aberto. Resolva antes de encerrar.`
            : ehHoje
              ? 'Encerre o dia para ver o resumo da noite. Às 5h o dia vira sozinho e os números recomeçam no 001.'
              : 'Este dia não foi encerrado. Está tudo resolvido: dá para encerrar agora.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Botao cor={abertos > 0 ? LARANJA : VERDE} onClick={abrir}>
          Encerrar o dia
        </Botao>
        {abertos > 0 && (
          <Botao variante="secundaria" onClick={() => navigate(enderecoParaResolver(dia))}>
            Ver e resolver
          </Botao>
        )}
      </div>

      {janela && (
        <Janela
          titulo={abertos > 0 ? 'Ainda não dá para encerrar' : `Encerrar ${nomeDoDia}?`}
          idTitulo="titulo-janela-encerrar"
          onFechar={() => setJanela(false)}
        >
          {abertos > 0 ? (
            <>
              <p className="text-[var(--text-primary)]">
                Impossível encerrar: {abertos === 1 ? '1 pedido em aberto' : `${abertos} pedidos em aberto`}. Diga o que aconteceu com
                cada um e depois encerre.
              </p>
              <div className="flex flex-col gap-2">
                <Botao cor={LARANJA} tamanho="grande" larguraTotal onClick={() => navigate(enderecoParaResolver(dia))}>
                  Ver e resolver
                </Botao>
                <Botao variante="secundaria" tamanho="grande" larguraTotal onClick={() => setJanela(false)}>
                  Voltar
                </Botao>
              </div>
            </>
          ) : (
            <>
              <p className="text-[var(--text-primary)]">
                Todos os pedidos foram entregues e recebidos. Depois de encerrar, o Caixa mostra o resumo da noite.
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Se entrar um pedido novo neste dia, ele reabre sozinho.</p>
              {erro && (
                <div className="flex flex-col gap-2">
                  <Aviso>{erro}</Aviso>
                  <Botao variante="secundaria" onClick={() => navigate(enderecoParaResolver(dia))}>
                    Ver e resolver
                  </Botao>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Botao cor={VERDE} tamanho="grande" larguraTotal onClick={encerrar} disabled={salvando}>
                  {salvando ? 'Encerrando…' : 'Encerrar o dia'}
                </Botao>
                <Botao variante="secundaria" tamanho="grande" larguraTotal onClick={() => setJanela(false)} disabled={salvando}>
                  Cancelar
                </Botao>
              </div>
            </>
          )}
        </Janela>
      )}
    </section>
  );
}
