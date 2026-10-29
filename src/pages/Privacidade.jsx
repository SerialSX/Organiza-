import { Link } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import ThemeToggle from '../components/ThemeToggle';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import { EMAIL_CONTATO } from '../lib/contato';

const ATUALIZADA_EM = 'outubro de 2026';

function Bloco({ titulo, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-[var(--text-primary)]">{titulo}</h2>
      <div className="flex flex-col gap-3 text-[var(--text-secondary)] leading-relaxed">{children}</div>
    </section>
  );
}

export default function Privacidade() {
  const { mode } = useTheme();

  return (
    <div className="min-h-svh bg-[var(--surface)]">
      <header className="max-w-2xl mx-auto flex items-center justify-between px-5 py-4">
        <Link to="/" className="rounded-lg" aria-label="Organiza+, página inicial">
          <img src={mode === 'dark' ? logoDark : logoLight} alt="" width="1372" height="434" className="h-8 w-auto" />
        </Link>
        <ThemeToggle />
      </header>

      <main className="max-w-2xl mx-auto px-5 pb-16 flex flex-col gap-10">
        <div className="flex flex-col gap-2 pt-4">
          <h1 className="text-3xl font-extrabold text-[var(--text-primary)]">Como cuidamos dos seus dados</h1>
          <p className="text-sm text-[var(--text-secondary)]">Atualizada em {ATUALIZADA_EM}.</p>
        </div>

        <Bloco titulo="Quem somos">
          <p>
            O Organiza+ é um projeto de extensão do curso de Análise e Desenvolvimento de Sistemas da Unifor, gratuito e
            sem fins lucrativos. Ele organiza os pedidos entre quem atende e a cozinha de pequenos negócios de comida.
          </p>
        </Bloco>

        <Bloco titulo="O que guardamos">
          <p>
            <strong className="text-[var(--text-primary)]">De quem usa o sistema:</strong> nome, e-mail e o nome do
            negócio. A senha fica guardada de forma embaralhada pelo serviço de login; nem a nossa equipe consegue ver.
          </p>
          <p>
            <strong className="text-[var(--text-primary)]">Do negócio:</strong> o cardápio (nomes, preços e, se você
            informar, custos e ingredientes com preço de compra) e os pedidos (itens, quantidades, observações, horários, status e motivo de cancelamento).
          </p>
          <p>
            <strong className="text-[var(--text-primary)]">De quem acompanha o pedido pelo QR code:</strong> não pedimos
            nome, telefone nem cadastro. O número do pedido fica guardado só no celular da pessoa, até o fim do dia. Para
            impedir abuso da página, guardamos por até uma hora um código embaralhado do endereço de internet do aparelho,
            nunca o endereço em si.
          </p>
        </Bloco>

        <Bloco titulo="Para que usamos">
          <p>Para o sistema funcionar: lançar pedidos, mostrar a fila da cozinha, avisar o cliente e montar os relatórios do negócio.</p>
          <p>
            Para a pesquisa do projeto, usamos só números gerais de uso, como quantidade de pedidos por dia, sem identificar
            pessoas nem negócios.
          </p>
        </Bloco>

        <Bloco titulo="O que não fazemos">
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>Não vendemos nem compartilhamos seus dados.</li>
            <li>Não usamos anúncios, rastreadores nem cookies de outras empresas.</li>
            <li>Um negócio nunca vê os dados de outro.</li>
          </ul>
        </Bloco>

        <Bloco titulo="Onde os dados ficam">
          <p>
            O banco de dados e o login ficam no Supabase, e o site fica hospedado na Vercel. Esses serviços guardam os dados
            para nós e não podem usá-los para outra coisa.
          </p>
        </Bloco>

        <Bloco titulo="Seus direitos">
          <p>Pela Lei Geral de Proteção de Dados (LGPD), você pode:</p>
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>ver e corrigir seus dados em Minha conta;</li>
            <li>apagar sua conta e todos os dados do negócio em Minha conta, na hora, sem precisar pedir;</li>
            <li>tirar dúvidas ou pedir uma cópia dos seus dados falando com a equipe do Organiza+.</li>
          </ul>
          <p>
            Contato:{' '}
            <a href={`mailto:${EMAIL_CONTATO}`} className="font-semibold text-[var(--texto-laranja)] underline underline-offset-4">
              {EMAIL_CONTATO}
            </a>
          </p>
        </Bloco>
      </main>
    </div>
  );
}
