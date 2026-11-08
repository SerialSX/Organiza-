import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../context/useTheme';
import { useAuth } from '../../context/useAuth';
import ThemeToggle from '../ThemeToggle';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import Tutorial from './Tutorial';
import GuiaCozinha from './GuiaCozinha';
import TelaDoCelular from '../TelaDoCelular';
import { dispensarTelaDoCelular, mostrarPassoDoCelular } from '../../lib/aparelho';
import EscolhaDoModo from './EscolhaDoModo';
import EscolhaDaCozinha from './EscolhaDaCozinha';
import { QuantasMesas, TaxaDeServico } from '../mesas/EscolhaDasMesas';
import { atendeNaMesa, precisaResponderMesas } from '../../lib/atendimento';
import { MESAS_PADRAO } from '../../lib/mesas';
import logoDark from '../../assets/logo.svg';
import logoLight from '../../assets/logo-light.svg';

const ACCENT = 'var(--color-brand-orange)';

function Cabecalho({ pergunta, titulo, porque, children }) {
  const h1 = useRef(null);
  // Cada etapa nova leva o foco (e o leitor de tela) para o título dela.
  useEffect(() => {
    h1.current?.focus();
    window.scrollTo({ top: 0 });
  }, [titulo]);

  return (
    <div className="flex flex-col gap-2">
      {pergunta && <p className="text-sm font-semibold text-[var(--texto-laranja)]">{pergunta}</p>}
      {children}
      <h1 ref={h1} tabIndex={-1} className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] outline-none">
        {titulo}
      </h1>
      {porque && (
        <p className="text-sm italic text-[var(--text-secondary)]">
          <span className="font-semibold not-italic">Por que perguntamos:</span> {porque}
        </p>
      )}
    </div>
  );
}

// Perguntas de boas-vindas: obrigatórias na primeira vez que o dono entra
// (inclusive em contas antigas). Sem menu, sem "pular". Depois de cada
// resposta, um passo a passo mostra como vai funcionar.
// Quem atende na mesa responde também quantas mesas tem e se cobra a taxa de
// serviço. Conta que já tinha respondido o resto antes do mapa das mesas
// responde só essas duas.
export default function BoasVindas({ onConcluir }) {
  const { mode } = useTheme();
  const { perfil, configurarAtendimento, configurarMesas } = useAuth();
  const [soMesas] = useState(() => perfil.modo_atendimento !== null && precisaResponderMesas(perfil));
  // modo | tutorial | mesas | taxa | cozinha | guia | um-aparelho | mesas-prontas | celular
  const [etapa, setEtapa] = useState(soMesas ? 'mesas' : 'modo');
  const [modo, setModo] = useState(soMesas ? perfil.modo_atendimento : null);
  const [usaTela, setUsaTela] = useState(null);
  const [mesas, setMesas] = useState(perfil.quantidade_mesas ?? MESAS_PADRAO);
  const [taxa, setTaxa] = useState(perfil.taxa_servico ?? null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const naMesa = Boolean(modo) && atendeNaMesa(modo);
  const totalDePerguntas = soMesas ? 2 : naMesa ? 4 : 2;
  const numero = (etapaDaPergunta) =>
    soMesas ? { mesas: 1, taxa: 2 }[etapaDaPergunta] : { modo: 1, mesas: 2, taxa: 3, cozinha: naMesa ? 4 : 2 }[etapaDaPergunta];
  const pergunta = (etapaDaPergunta) => `Pergunta ${numero(etapaDaPergunta)} de ${totalDePerguntas}`;

  // Último passo, só em celular ou tablet e sem obrigação: o ícone na tela do
  // celular. Já aberto pelo ícone, ou com "Agora não" antes, não aparece.
  function concluir() {
    if (etapa !== 'celular' && mostrarPassoDoCelular()) setEtapa('celular');
    else onConcluir();
  }

  // As mesas primeiro: se falhar, nada fica salvo pela metade e a pessoa
  // continua nas perguntas.
  async function salvarMesas() {
    if (!naMesa) return { erro: null };
    return configurarMesas({ quantidade: mesas, taxaServico: taxa });
  }

  async function salvarCozinha() {
    setErro('');
    setSalvando(true);
    let { erro: falha } = await salvarMesas();
    if (!falha) ({ erro: falha } = await configurarAtendimento({ modo, usaTelaCozinha: usaTela }));
    setSalvando(false);
    if (falha) {
      setErro(falha);
      return;
    }
    setEtapa(usaTela ? 'guia' : 'um-aparelho');
  }

  async function salvarSoMesas() {
    setErro('');
    setSalvando(true);
    const { erro: falha } = await salvarMesas();
    setSalvando(false);
    if (falha) setErro(falha);
    else setEtapa('mesas-prontas');
  }

  return (
    <div className="min-h-svh bg-[var(--surface)]">
      <header className="max-w-3xl mx-auto flex items-center justify-between px-5 py-4">
        <img src={mode === 'dark' ? logoDark : logoLight} alt="Organiza+" width="1372" height="434" className="h-8 w-auto" />
        <ThemeToggle />
      </header>

      <main className="max-w-3xl mx-auto px-5 pb-16 pt-2 flex flex-col gap-6">
        {etapa === 'modo' && (
          <>
            <Cabecalho
              pergunta={`Vamos deixar o Organiza+ do seu jeito · ${pergunta('modo')}`}
              titulo="Como você atende seus clientes?"
              porque="assim o Organiza+ sabe se cada pedido termina na hora ou se vai somando numa conta até o cliente ir embora."
            >
              <p className="text-[var(--text-secondary)]">
                Cada negócio trabalha de um jeito. Responda algumas perguntas rápidas e o Organiza+ vai funcionar do jeito que
                você já trabalha. Dá para mudar as respostas depois.
              </p>
            </Cabecalho>
            <EscolhaDoModo valor={modo} onMudar={setModo} />
            <p className="text-sm text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">Ficou em dúvida?</strong> Escolha a primeira. Dá para trocar quando
              quiser em <strong className="text-[var(--text-primary)]">Minha conta → Como você atende</strong>.
            </p>
            <Botao tamanho="grande" cor={ACCENT} className="self-start" disabled={!modo} onClick={() => setEtapa('tutorial')}>
              Usar este jeito
            </Botao>
          </>
        )}

        {etapa === 'tutorial' && (
          <>
            <Cabecalho titulo="Veja como vai funcionar" />
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 sm:p-6">
              <Tutorial
                modo={modo}
                rotuloFim="Entendi, continuar"
                onFim={() => setEtapa(naMesa ? 'mesas' : 'cozinha')}
                onVoltarAntesDoInicio={() => setEtapa('modo')}
              />
            </div>
            <p className="text-sm text-[var(--text-secondary)]">Este passo a passo fica guardado na Ajuda.</p>
          </>
        )}

        {etapa === 'mesas' && (
          <>
            <Cabecalho
              pergunta={soMesas ? `Novidade: mapa das mesas · ${pergunta('mesas')}` : pergunta('mesas')}
              titulo="Quantas mesas você tem?"
              porque="o Organiza+ mostra um mapa com as suas mesas. Você toca na mesa para lançar o pedido e vê na hora quais estão ocupadas e quanto cada uma já gastou."
            >
              {soMesas && (
                <p className="text-[var(--text-secondary)]">
                  Agora, em vez de digitar o número da mesa, você toca nela num mapa. Responda 2 perguntas rápidas.
                </p>
              )}
            </Cabecalho>
            <QuantasMesas valor={mesas} onMudar={setMesas} />
            <p className="text-sm text-[var(--text-secondary)]">
              Conte as mesas que você monta numa noite normal. Num dia de movimento, dá para abrir uma{' '}
              <strong className="text-[var(--text-primary)]">mesa extra</strong> na hora.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {!soMesas && (
                <Botao variante="secundaria" onClick={() => setEtapa('tutorial')}>
                  ← Voltar
                </Botao>
              )}
              <Botao tamanho="grande" cor={ACCENT} onClick={() => setEtapa('taxa')}>
                Continuar
              </Botao>
            </div>
          </>
        )}

        {etapa === 'taxa' && (
          <>
            <Cabecalho
              pergunta={pergunta('taxa')}
              titulo="Você cobra a taxa de serviço?"
              porque="ao fechar a mesa, o Organiza+ já soma a taxa na conta. No Caixa, ela aparece separada, porque é dos garçons e não entra no que você vendeu."
            />
            <TaxaDeServico taxa={taxa} onMudar={setTaxa} />
            {erro && <Aviso>{erro}</Aviso>}
            <div className="flex flex-wrap items-center gap-3">
              <Botao variante="secundaria" onClick={() => setEtapa('mesas')}>
                ← Voltar
              </Botao>
              <Botao
                tamanho="grande"
                cor={ACCENT}
                disabled={taxa === null || salvando}
                onClick={soMesas ? salvarSoMesas : () => setEtapa('cozinha')}
              >
                {salvando ? 'Salvando…' : 'Continuar'}
              </Botao>
            </div>
          </>
        )}

        {etapa === 'mesas-prontas' && (
          <>
            <Cabecalho titulo="Pronto! Suas mesas estão no mapa" />
            <ol className="list-decimal pl-6 flex flex-col gap-2 text-lg text-[var(--text-primary)]">
              <li>
                Em <strong>Pedidos</strong>, toque na mesa livre (cinza) para lançar o pedido dela.
              </li>
              <li>A mesa fica laranja e mostra quanto já foi consumido.</li>
              <li>
                Quando o cliente for embora, toque na mesa e em <strong>Fechar mesa</strong>.
              </li>
            </ol>
            <p className="text-[var(--text-secondary)]">
              Dá para mudar o número de mesas e a taxa em{' '}
              <strong className="text-[var(--text-primary)]">Minha conta → Como você atende</strong>.
            </p>
            <Botao tamanho="grande" cor={ACCENT} className="self-start" onClick={concluir}>
              Entendi, começar
            </Botao>
          </>
        )}

        {etapa === 'cozinha' && (
          <>
            <Cabecalho
              pergunta={pergunta('cozinha')}
              titulo="Quem prepara os pedidos fica longe de você?"
              porque="se quem prepara fica longe do balcão, o Organiza+ mostra cada pedido num celular ou tablet na cozinha, na hora em que você lança. Sem papel e sem precisar gritar o pedido."
            />
            <EscolhaDaCozinha valor={usaTela} onMudar={setUsaTela} />
            {erro && <Aviso>{erro}</Aviso>}
            <div className="flex flex-wrap items-center gap-3">
              <Botao variante="secundaria" onClick={() => setEtapa(naMesa ? 'taxa' : 'tutorial')}>
                ← Voltar
              </Botao>
              <Botao tamanho="grande" cor={ACCENT} disabled={usaTela === null || salvando} onClick={salvarCozinha}>
                {salvando ? 'Salvando…' : 'Continuar'}
              </Botao>
            </div>
          </>
        )}

        {etapa === 'guia' && (
          <>
            <Cabecalho titulo="Como ligar o aparelho da cozinha" />
            <GuiaCozinha
              negocioId={perfil.negocio_id}
              rotuloFechar="Faço isso depois"
              rotuloDepoisDoTeste="Começar a usar"
              onFechar={concluir}
            />
            <p className="text-sm text-[var(--text-secondary)]">
              Este passo a passo fica guardado em <strong className="text-[var(--text-primary)]">Ajuda → Como ligar o aparelho da cozinha</strong>.
            </p>
          </>
        )}

        {etapa === 'um-aparelho' && (
          <>
            <Cabecalho titulo="Certo! Tudo num aparelho só" />
            <ol className="list-decimal pl-6 flex flex-col gap-2 text-lg text-[var(--text-primary)]">
              <li>Você lança o pedido.</li>
              <li>
                Ele aparece logo embaixo, em <strong>Preparando</strong>.
              </li>
              <li>
                Ficou pronto? Toque em <strong>Pronto</strong>{' '}
                {modo === 'mesa' ? 'e leve até a mesa.' : modo === 'balcao' ? 'e chame o número do cliente.' : 'e chame o número ou leve até a mesa.'}
              </li>
            </ol>
            <p className="text-[var(--text-secondary)]">
              Se um dia você colocar um aparelho na cozinha, é só mudar em{' '}
              <strong className="text-[var(--text-primary)]">Minha conta → Como você atende</strong>.
            </p>
            <Botao tamanho="grande" cor={ACCENT} className="self-start" onClick={concluir}>
              Entendi, começar
            </Botao>
          </>
        )}
        {etapa === 'celular' && (
          <>
            <Cabecalho titulo="Deixe o Organiza+ na tela do seu celular">
              <p className="text-[var(--text-secondary)]">
                Assim ele fica junto com o WhatsApp e você abre com um toque, sem procurar o endereço. É opcional.
              </p>
            </Cabecalho>
            <TelaDoCelular />
            <p className="text-sm text-[var(--text-secondary)]">
              Este passo fica guardado em <strong className="text-[var(--text-primary)]">Ajuda → Colocar na tela do celular</strong>.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Botao tamanho="grande" cor={ACCENT} onClick={onConcluir}>
                Começar a usar
              </Botao>
              <Botao
                variante="secundaria"
                onClick={() => {
                  dispensarTelaDoCelular();
                  onConcluir();
                }}
              >
                Agora não
              </Botao>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
