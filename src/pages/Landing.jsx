import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ProductMockup from '../components/ProductMockup';
import {
  RealTimeIcon,
  StockIcon,
  QueueIcon,
  ReportsIcon,
} from '../components/icons/FeatureIcons';

const features = [
  {
    icon: RealTimeIcon,
    title: 'Pedido em tempo real',
    text: 'Quem atende manda o pedido, a cozinha recebe na hora, sem papel e sem gritar pedido de longe.',
    accent: 'var(--color-accent-pedidos)',
  },
  {
    icon: StockIcon,
    title: 'Estoque atualizado na hora',
    text: 'Acabou um produto? A cozinha avisa em um clique, e ninguém vende o que não existe mais.',
    accent: 'var(--color-accent-produtos)',
  },
  {
    icon: QueueIcon,
    title: 'Fila organizada',
    text: 'Veja qual pedido chegou primeiro e quais estão demorando demais.',
    accent: 'var(--color-accent-cozinha)',
  },
  {
    icon: ReportsIcon,
    title: 'Relatórios automáticos',
    text: 'Descubra o que mais vende e o que dá mais lucro, sem precisar calcular nada.',
    accent: 'var(--color-accent-relatorios)',
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--text-primary)]">
      <Navbar />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
        <div className="text-center lg:text-left">
          <span className="inline-block bg-brand-orange text-white text-xs font-bold px-4 py-1.5 rounded-full mb-6 shadow-lg shadow-brand-orange/30">
            100% gratuito para pequenos negócios
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Pedido <span className="text-brand-orange">sem bagunça.</span>
          </h1>
          <p className="text-[var(--text-secondary)] text-lg mb-4 max-w-md mx-auto lg:mx-0">
            O sistema que organiza o fluxo do seu food truck, do pedido até a cozinha, em tempo real.
          </p>
          <p className="text-[var(--text-secondary)] text-xs mb-8 max-w-md mx-auto lg:mx-0">
            Feito com base em pesquisa real com empreendedores de Fortaleza.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
            <button
              onClick={() => navigate('/cadastro')}
              className="w-full sm:w-auto bg-brand-orange hover:brightness-110 text-white font-semibold px-7 py-3.5 rounded-lg transition shadow-lg shadow-brand-orange/20"
            >
              Criar minha conta grátis
            </button>
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto border border-[var(--border-subtle)] hover:bg-[var(--surface-card-hover)] text-[var(--text-primary)] font-medium px-7 py-3.5 rounded-lg transition"
            >
              Já tenho conta
            </button>
          </div>
        </div>

        <ProductMockup />
      </section>

      {/* Bloco de dor */}
      <section className="max-w-2xl mx-auto text-center px-6 py-14 border-t border-[var(--border-subtle)]">
        <h2 className="text-2xl font-bold mb-3">Você já perdeu um pedido assim?</h2>
        <p className="text-[var(--text-secondary)]">
          Pedido anotado errado. Cliente esperando. Produto que acabou e ninguém avisou a tempo.
        </p>
      </section>

      {/* Funcionalidades */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-[var(--border-subtle)]">
        <h2 className="text-2xl font-bold text-center mb-12">O que o Organiza+ resolve</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map(({ icon: Icon, title, text, accent }) => (
            <div
              key={title}
              className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col items-start gap-4"
            >
              <span
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl"
                style={{ backgroundColor: accent }}
              >
                <Icon className="w-8 h-8 text-white" />
              </span>
              <h3 className="font-semibold text-base">{title}</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="max-w-2xl mx-auto text-center px-6 py-16 border-t border-[var(--border-subtle)]">
        <h2 className="text-2xl sm:text-3xl font-bold mb-8">
          Comece a organizar seu negócio hoje
        </h2>
        <button
          onClick={() => navigate('/cadastro')}
          className="bg-brand-orange hover:brightness-110 text-white font-semibold px-8 py-3.5 rounded-lg transition shadow-lg shadow-brand-orange/20"
        >
          Criar conta grátis
        </button>
      </section>

      {/* Rodapé */}
      <footer className="border-t border-[var(--border-subtle)] px-6 py-10 text-center">
        <p className="font-bold mb-1">Organiza+</p>
        <p className="text-[var(--text-secondary)] text-xs">
          Projeto de extensão acadêmica. Gratuito e sem fins lucrativos.
        </p>
      </footer>
    </div>
  );
}
