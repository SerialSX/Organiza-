import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import PrintDaTela from '../components/PrintDaTela';
import printPedidos from '../assets/prints/pedidos.jpg';
import printCozinha from '../assets/prints/cozinha.jpg';
import printRelatorios from '../assets/prints/relatorios.jpg';
import printDestaques from '../assets/prints/relatorio-destaques.jpg';
import printFaturamento from '../assets/prints/relatorio-faturamento.jpg';
import printReposicao from '../assets/prints/relatorio-reposicao.jpg';

const passos = [
  {
    numero: '01',
    titulo: 'Comanda digital',
    paragrafos: [
      'O pedido é lançado diretamente no sistema. Assim, a venda já fica registrada enquanto o atendimento acontece, sem precisar fazer uma anotação separada para alimentar o relatório depois.',
    ],
    print: { label: 'Tela de lançamento de pedidos', fase: 'Fase 3', src: printPedidos },
  },
  {
    numero: '02',
    titulo: 'Cozinha em tempo real',
    paragrafos: [
      'O pedido chega à tela da cozinha assim que é lançado. A equipe acompanha o que precisa ser preparado e o atendimento ganha mais clareza durante a operação.',
    ],
    print: { label: 'Tela da cozinha em tempo real', fase: 'Fase 4', src: printCozinha },
  },
  {
    numero: '03',
    titulo: 'Relatório automático',
    paragrafos: [
      'É aqui que os dados viram informação para o negócio.',
      'A partir dos pedidos registrados, o Organiza+ mostra o que está acontecendo nas suas vendas. Você consegue identificar o produto mais vendido, o produto mais lucrativo, acompanhar o faturamento por período e receber aviso de reposição de estoque.',
      'Sem precisar parar o trabalho para fazer contas ou preencher planilhas.',
    ],
    print: { label: 'Tela de relatórios', fase: 'Fase 5', src: printRelatorios },
  },
];

const relatorios = [
  {
    titulo: 'Mais vendido x mais lucrativo',
    texto:
      'Descubra qual produto sai mais e qual traz mais retorno. Vender mais nem sempre significa lucrar mais. O relatório coloca essas informações lado a lado.',
    print: { label: 'Mais vendido x mais lucrativo', fase: 'Fase 5', src: printDestaques },
  },
  {
    titulo: 'Faturamento por período',
    texto:
      'Acompanhe o faturamento de acordo com o período consultado. Assim, você consegue olhar para o movimento do negócio com base no que realmente foi registrado.',
    print: { label: 'Faturamento por período', fase: 'Fase 5', src: printFaturamento },
  },
  {
    titulo: 'Aviso de reposição de estoque',
    texto:
      'Saiba quais itens precisam de atenção antes que faltem. O sistema ajuda você a acompanhar o estoque a partir da movimentação dos pedidos.',
    print: { label: 'Aviso de reposição de estoque', fase: 'Fase 5', src: printReposicao, encaixe: 'cover' },
  },
];

const reducaoRisco = [
  {
    titulo: 'Grátis',
    texto: 'O Organiza+ é gratuito para você começar a usar.',
  },
  {
    titulo: 'Sem instalação',
    texto: 'Você consegue acessar pelo seu celular ou computador.',
  },
];

const botaoPrimario =
  'w-full sm:w-auto inline-flex items-center justify-center bg-brand-orange hover:brightness-110 text-white font-semibold px-7 py-3.5 rounded-lg transition shadow-lg shadow-brand-orange/20';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--text-primary)]">
      <Navbar />

      {/* 1. Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-16 sm:pt-20 pb-20 text-center">
        <span className="inline-block text-brand-orange text-xs font-bold tracking-[0.25em] mb-6">
          ORGANIZA+
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.15] mb-6">
          Pare de decidir no escuro. Veja o que realmente acontece no seu negócio.
        </h1>
        <p className="text-[var(--text-secondary)] text-base sm:text-lg leading-relaxed mb-8">
          Lance os pedidos na comanda digital, acompanhe a cozinha em tempo real e deixe o
          Organiza+ transformar essa operação em informação sobre o seu negócio, sem perder tempo.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
          <button onClick={() => navigate('/cadastro')} className={botaoPrimario}>
            Quero usar o Organiza+
          </button>
          <a
            href="#como-funciona"
            className="w-full sm:w-auto inline-flex items-center justify-center border border-[var(--border-subtle)] hover:bg-[var(--surface-card-hover)] text-[var(--text-primary)] font-medium px-7 py-3.5 rounded-lg transition"
          >
            Ver como funciona
          </a>
        </div>
        <p className="text-[var(--text-secondary)] text-sm">
          Gratuito. Sem instalação. E perfeito para o seu negócio.
        </p>
      </section>

      {/* 2. O problema */}
      <section className="max-w-3xl mx-auto px-6 py-20 border-t border-[var(--border-subtle)]">
        <h2 className="text-2xl sm:text-3xl font-bold leading-snug mb-8">
          Trabalhar todos os dias não significa enxergar tudo o que acontece. Sem os dados certos,
          cada decisão vira uma aposta.
        </h2>
        <div className="space-y-5 text-[var(--text-secondary)] leading-relaxed">
          <p>
            Você sabe o que vende, conhece seus clientes e acompanha o movimento do seu negócio.
            Mas algumas respostas ficam difíceis de enxergar no meio da correria.
          </p>
          <p>
            Qual produto vende mais? Qual realmente deixa mais dinheiro? Quanto entrou em
            determinado período? O que está perto de acabar no estoque?
          </p>
          <p>
            Essas informações já estão acontecendo na sua operação. O problema é que, sem um
            registro organizado, elas ficam espalhadas entre pedidos, memória, papel e rotina.
          </p>
          <p className="text-[var(--text-primary)] font-medium">
            O Organiza+ registra o que acontece durante o atendimento e transforma isso em
            informação para você consultar.
          </p>
        </div>
      </section>

      {/* 3. Como funciona */}
      <section
        id="como-funciona"
        className="max-w-6xl mx-auto px-6 py-20 border-t border-[var(--border-subtle)] scroll-mt-20"
      >
        <h2 className="text-2xl sm:text-3xl font-bold leading-snug mb-14 max-w-3xl">
          Você registra o pedido. O Organiza+ ganha tempo na sua cozinha e mostra como o seu
          negócio está indo.
        </h2>
        <div className="space-y-16">
          {passos.map((passo, indice) => {
            const inverte = indice % 2 === 1;
            return (
              <div
                key={passo.numero}
                className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center"
              >
                <div className={inverte ? 'lg:order-2' : undefined}>
                  <span className="text-brand-orange text-sm font-bold tracking-widest">
                    {passo.numero}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-bold mt-2 mb-4">{passo.titulo}</h3>
                  <div className="space-y-4 text-[var(--text-secondary)] leading-relaxed">
                    {passo.paragrafos.map((paragrafo) => (
                      <p key={paragrafo}>{paragrafo}</p>
                    ))}
                  </div>
                </div>
                <PrintDaTela
                  src={passo.print.src}
                  label={passo.print.label}
                  fase={passo.print.fase}
                  className={inverte ? 'lg:order-1' : undefined}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. O que os relatórios mostram */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-t border-[var(--border-subtle)]">
        <h2 className="text-2xl sm:text-3xl font-bold text-center leading-snug mb-14 max-w-2xl mx-auto">
          O que você precisa saber sobre o seu negócio, em números.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {relatorios.map((item) => (
            <article
              key={item.titulo}
              className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col gap-4"
            >
              <PrintDaTela src={item.print.src} label={item.print.label} fase={item.print.fase} encaixe={item.print.encaixe ?? 'contain'} />
              <h3 className="font-semibold text-lg">{item.titulo}</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{item.texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 5. Por que confiar */}
      <section className="max-w-2xl mx-auto px-6 py-20 border-t border-[var(--border-subtle)] text-center space-y-5">
        <p className="text-lg leading-relaxed">
          O Organiza+ foi pensado para essa realidade, sem exigir uma rotina separada para fazer
          gestão.
        </p>
        <p className="text-lg leading-relaxed">
          Feito para aumentar o rendimento do seu negócio, entendendo exatamente a sua rotina.
        </p>
      </section>

      {/* 6. Redução de risco */}
      <section className="max-w-3xl mx-auto px-6 py-20 border-t border-[var(--border-subtle)]">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
          Experimente antes de decidir.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {reducaoRisco.map((item) => (
            <div
              key={item.titulo}
              className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl p-6 text-center"
            >
              <h3 className="font-semibold text-lg mb-2">{item.titulo}</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{item.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 7. CTA final */}
      <section className="max-w-2xl mx-auto px-6 py-20 border-t border-[var(--border-subtle)] text-center">
        <h2 className="text-2xl sm:text-3xl font-bold leading-snug mb-6">
          Veja o que os números do seu próprio negócio estão dizendo.
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-8">
          Você não precisa trabalhar mais para ter mais informação sobre o seu negócio. Comece
          usando a operação que já existe: registre os pedidos, acompanhe a cozinha e deixe o
          Organiza+ organizar os dados para você consultar quando precisar.
        </p>
        <button onClick={() => navigate('/cadastro')} className={botaoPrimario}>
          Quero conhecer o Organiza+
        </button>
      </section>

      {/* 8. Rodapé */}
      <footer className="border-t border-[var(--border-subtle)] px-6 py-10">
        <p className="text-[var(--text-secondary)] text-sm text-center max-w-2xl mx-auto leading-relaxed">
          Organiza+ é um projeto de extensão sem fins lucrativos desenvolvido por alunos de Análise
          e Desenvolvimento de Sistemas da Unifor.
        </p>
      </footer>
    </div>
  );
}
