import { useEffect, useRef, useState } from 'react';
import Botao from '../ui/Botao';
import { MODOS } from '../../lib/atendimento';

const LARANJA = 'var(--color-brand-orange)';
const VERDE = 'var(--color-accent-relatorios)';

// Telinhas desenhadas com as cores do tema. Não são botões de verdade: são só
// figuras, por isso ficam escondidas do leitor de tela (o texto do passo diz tudo).
function Tela({ rotulo, children }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <p className="text-xs font-semibold text-[var(--text-secondary)]">{rotulo}</p>
      <div
        aria-hidden="true"
        className="flex flex-col gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3 min-h-44 text-[var(--text-primary)]"
      >
        {children}
      </div>
    </div>
  );
}

function Chip({ toque, cheio, cor = LARANJA, children, className = '' }) {
  return (
    <span
      className={`rounded-lg border px-2 py-1.5 text-center text-xs font-semibold leading-tight ${toque ? 'toque-aqui' : ''} ${className}`}
      style={
        cheio
          ? { backgroundColor: cor, borderColor: cor, color: 'var(--sobre-destaque)' }
          : { borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-card)' }
      }
    >
      {children}
    </span>
  );
}

function Centro({ children }) {
  return <div className="m-auto text-center text-sm text-[var(--text-secondary)] flex flex-col items-center gap-1">{children}</div>;
}

function Numero({ toque }) {
  return (
    <span className={`rounded-lg px-2 text-4xl font-extrabold tracking-widest tabular-nums text-[var(--texto-laranja)] ${toque ? 'toque-aqui' : ''}`}>
      014
    </span>
  );
}

function Status({ pronto, children }) {
  return (
    <span
      className="mt-auto rounded-xl px-2 py-2 text-center text-sm font-bold"
      style={{
        backgroundColor: `color-mix(in srgb, ${pronto ? VERDE : LARANJA} 22%, transparent)`,
        color: pronto ? 'var(--texto-relatorios)' : 'var(--texto-laranja)',
      }}
    >
      {children}
    </span>
  );
}

function Produtos({ toque = 1 }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {['Pastel de carne', 'Pastel de queijo', 'Caldo de cana', 'Pastel misto'].map((nome, i) => (
        <Chip key={nome} toque={i === toque}>
          {nome}
        </Chip>
      ))}
    </div>
  );
}

function Pagamento({ toque }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {['Pix', 'Dinheiro', 'Crédito', 'Débito'].map((f, i) => (
        <Chip key={f} toque={toque && i === 0} cheio={toque && i === 0} cor="var(--color-accent-pedidos)" className="px-0.5 py-1 text-[11px]">
          {f}
        </Chip>
      ))}
    </div>
  );
}

function Mesa({ toque }) {
  return (
    <span className={`self-start rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-xs font-bold ${toque ? 'toque-aqui' : ''}`}>
      Mesa <span className="tabular-nums">4</span>
    </span>
  );
}

function Pronto({ titulo }) {
  return (
    <>
      <span className="text-xs text-[var(--text-secondary)]">Preparando</span>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2">
        <b className="text-lg tabular-nums">{titulo}</b>
        <Chip toque cheio cor={VERDE}>
          Pronto
        </Chip>
      </div>
    </>
  );
}

const PASSOS = {
  balcao: [
    {
      titulo: 'O cliente pede e paga. Você toca nos produtos, em como ele pagou e em Enviar.',
      texto: 'Do mesmo jeito que você anotaria no papel, só que tocando na tela.',
      celular: (
        <>
          <Produtos />
          <Pagamento toque />
          <Chip toque cheio className="mt-auto">
            Enviar
          </Chip>
        </>
      ),
      cliente: (
        <Centro>
          <span className="text-2xl">💳</span>Pagando no balcão
        </Centro>
      ),
    },
    {
      titulo: 'Aparece um número. Fale esse número para o cliente.',
      texto: 'Cada pedido ganha um número de 3 dígitos. Acaba a confusão de quem pediu primeiro.',
      celular: (
        <Centro>
          Diga ao cliente o número
          <Numero toque />
        </Centro>
      ),
      cliente: (
        <Centro>
          <span className="text-2xl">👂</span>&quot;Seu número é
          <b className="text-2xl text-[var(--text-primary)] tabular-nums">014</b>&quot;
        </Centro>
      ),
    },
    {
      titulo: 'O cliente lê o QR code do cartaz e acompanha pelo celular.',
      texto: 'Você imprime o cartaz uma vez, em Minha conta → Página do cliente, e cola no balcão. O cliente não baixa nada.',
      rotuloCelular: 'Cartaz no seu balcão',
      celular: (
        <Centro>
          <span className="text-xs">Seu negócio</span>
          <span className="toque-aqui grid grid-cols-3 gap-0.5 rounded bg-white p-1.5">
            {[1, 1, 0, 1, 0, 1, 0, 1, 1].map((cheio, i) => (
              <span key={i} className="w-4 h-4" style={{ backgroundColor: cheio ? '#111' : '#fff' }} />
            ))}
          </span>
          <b className="text-xs text-[var(--text-primary)]">Acompanhe seu pedido</b>
        </Centro>
      ),
      cliente: (
        <>
          <span className="text-xs text-[var(--text-secondary)]">Seu negócio</span>
          <b className="text-sm">Pedido 014</b>
          <Status>⏳ Preparando</Status>
        </>
      ),
    },
    {
      titulo: 'Ficou pronto? Toque em Pronto e chame o número.',
      texto: 'Na mesma hora, o celular do cliente mostra que já pode buscar. Menos gente perguntando "e o meu?".',
      celular: <Pronto titulo="014" />,
      cliente: (
        <>
          <span className="text-xs text-[var(--text-secondary)]">Seu negócio</span>
          <b className="text-sm">Pedido 014</b>
          <Status pronto>✅ Pronto! Pode buscar</Status>
        </>
      ),
    },
  ],
  mesa: [
    {
      titulo: 'O cliente senta e pede. Você toca na mesa dele no mapa, nos produtos e em Enviar.',
      texto: 'Não tem número para falar nem QR code: quem atende leva o pedido até a mesa.',
      celular: (
        <>
          <Mesa toque />
          <Produtos toque={0} />
          <Chip toque cheio className="mt-auto">
            Enviar
          </Chip>
        </>
      ),
      cliente: (
        <Centro>
          <span className="text-2xl">🪑</span>Sentado na mesa 4
        </Centro>
      ),
    },
    {
      titulo: 'Pediu mais? Toque na mesa (laranja) e em Lançar mais.',
      texto: 'O Organiza+ vai somando tudo na conta daquela mesa e mostra o total no mapa. Ninguém precisa anotar no papel.',
      celular: (
        <>
          <span className="text-xs text-[var(--text-secondary)]">Contas abertas</span>
          <div className="toque-aqui flex flex-col gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2">
            <b className="text-sm">Mesa 4</b>
            <span className="text-xs text-[var(--text-secondary)]">2 pedidos</span>
            <b className="text-lg tabular-nums">R$ 36,00</b>
          </div>
        </>
      ),
      cliente: (
        <Centro>
          <span className="text-2xl">🍢</span>&quot;Traz mais dois espetinhos!&quot;
        </Centro>
      ),
    },
    {
      titulo: 'Ficou pronto? Toque em Pronto e leve até a mesa.',
      texto: 'O pedido mostra o número da mesa em destaque. Ninguém precisa gritar.',
      celular: <Pronto titulo="Mesa 4" />,
      cliente: (
        <Centro>
          <span className="text-2xl">🍽️</span>Recebe na mesa
        </Centro>
      ),
    },
    {
      titulo: 'Na hora de ir embora, toque na mesa, em Fechar mesa e em como pagaram.',
      texto: 'O total já está somado, com a taxa de serviço se você cobra. Dá para dividir entre as pessoas, e a mesa fica livre.',
      celular: (
        <>
          <div className="flex items-baseline justify-between">
            <b className="text-sm">Mesa 4</b>
            <b className="tabular-nums">R$ 36,00</b>
          </div>
          <Chip toque cheio cor={VERDE}>
            Fechar mesa
          </Chip>
          <Pagamento />
        </>
      ),
      cliente: (
        <Centro>
          <span className="text-2xl">💳</span>Paga tudo de uma vez
        </Centro>
      ),
    },
  ],
  balcao_e_mesa: [
    {
      titulo: 'A cada pedido, toque em Balcão ou em Mesa.',
      texto: 'Balcão é para quem pede e espera. Mesa é para quem senta e paga no final.',
      celular: (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <Chip toque>Balcão</Chip>
            <Chip toque>Mesa</Chip>
          </div>
          <Produtos />
        </>
      ),
      cliente: (
        <Centro>
          <span className="text-2xl">🙋 🪑</span>Um no balcão, outro na mesa
        </Centro>
      ),
    },
    {
      titulo: 'No balcão: o cliente paga na hora e você fala o número.',
      texto: 'Quando ficar pronto, você chama o número. O cliente também acompanha pelo QR code do cartaz.',
      celular: (
        <>
          <Pagamento toque />
          <Centro>
            Diga ao cliente o número
            <Numero />
          </Centro>
        </>
      ),
      cliente: (
        <Centro>
          <span className="text-2xl">👂</span>&quot;Seu número é
          <b className="text-2xl text-[var(--text-primary)] tabular-nums">014</b>&quot;
        </Centro>
      ),
    },
    {
      titulo: 'Na mesa: toque na mesa dele no mapa. Os pedidos vão somando na conta dela.',
      texto: 'Não precisa receber agora. O cliente pede aos poucos e paga tudo no final.',
      celular: (
        <>
          <Mesa toque />
          <span className="text-xs text-[var(--text-secondary)]">Contas abertas</span>
          <div className="flex items-baseline justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2">
            <b className="text-sm">Mesa 4</b>
            <b className="tabular-nums">R$ 36,00</b>
          </div>
        </>
      ),
      cliente: (
        <Centro>
          <span className="text-2xl">🍢</span>&quot;Traz mais um!&quot;
        </Centro>
      ),
    },
    {
      titulo: 'Quando a mesa for embora, toque nela, em Fechar mesa e em como pagaram.',
      texto: 'No fim da noite, o Caixa mostra quanto entrou em Pix, dinheiro, crédito e débito.',
      celular: (
        <>
          <div className="flex items-baseline justify-between">
            <b className="text-sm">Mesa 4</b>
            <b className="tabular-nums">R$ 36,00</b>
          </div>
          <Chip toque cheio cor={VERDE}>
            Fechar mesa
          </Chip>
          <Pagamento />
        </>
      ),
      cliente: (
        <Centro>
          <span className="text-2xl">💳</span>Paga tudo de uma vez
        </Centro>
      ),
    },
  ],
};

// Passo a passo de como o Organiza+ vai funcionar no jeito escolhido. Um
// passo por vez; o último botão encerra (onFim).
export default function Tutorial({ modo, onFim, rotuloFim = 'Entendi, começar', onVoltarAntesDoInicio }) {
  const passos = PASSOS[modo] ?? PASSOS.balcao;
  const nomeDoModo = MODOS.find((m) => m.id === modo)?.rotulo ?? 'Balcão';
  const [atual, setAtual] = useState(0);
  const titulo = useRef(null);
  const passo = passos[atual];
  const ultimo = atual === passos.length - 1;

  // Trocou de passo: o leitor de tela e o teclado vão para o título novo.
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    titulo.current?.focus();
  }, [atual]);

  return (
    <section aria-label={`Como funciona: ${nomeDoModo}`} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
        <span>
          {nomeDoModo} · Passo {atual + 1} de {passos.length}
        </span>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {passos.map((_, i) => (
            <span
              key={i}
              className="h-2 rounded-full transition-all"
              style={{ width: i === atual ? 20 : 8, backgroundColor: i === atual ? LARANJA : 'var(--border-subtle)' }}
            />
          ))}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h3 ref={titulo} tabIndex={-1} className="text-xl font-bold text-[var(--text-primary)] outline-none">
          {atual + 1}. {passo.titulo}
        </h3>
        <p className="text-[var(--text-secondary)]">{passo.texto}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tela rotulo={passo.rotuloCelular ?? 'Seu celular'}>{passo.celular}</Tela>
        <Tela rotulo="O que o cliente vê">{passo.cliente}</Tela>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        {atual > 0 ? (
          <Botao variante="secundaria" onClick={() => setAtual((a) => a - 1)}>
            ← Voltar
          </Botao>
        ) : onVoltarAntesDoInicio ? (
          <Botao variante="secundaria" onClick={onVoltarAntesDoInicio}>
            ← Trocar a resposta
          </Botao>
        ) : (
          <span />
        )}
        {ultimo ? (
          <Botao onClick={onFim}>{rotuloFim} ✓</Botao>
        ) : (
          <Botao onClick={() => setAtual((a) => a + 1)}>Próximo →</Botao>
        )}
      </div>
    </section>
  );
}
