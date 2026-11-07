import { Link } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import ThemeToggle from '../components/ThemeToggle';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import { useAuth } from '../context/useAuth';
import { EMAIL_CONTATO, GRUPO_WHATSAPP } from '../lib/contato';

const PERGUNTAS = [
  {
    pergunta: 'Quem cadastra o cardápio?',
    resposta: (
      <>
        Você, em poucos minutos: em <Link to="/produtos">Produtos</Link> dá para começar com um cardápio pronto
        (pastelaria, hamburgueria, espetaria ou bebidas) e só ajustar os preços. Se preferir, a equipe do projeto
        cadastra junto com você.
      </>
    ),
  },
  {
    pergunta: 'A internet caiu. Perco o pedido?',
    resposta:
      'Não. O pedido fica guardado no aparelho e vai para a cozinha sozinho quando a internet voltar, sem duplicar. A senha aparece assim que ele sair. Enquanto isso, a tela mostra quantos pedidos estão esperando.',
  },
  {
    pergunta: 'Minha cozinha fica do lado do balcão. Preciso de outra tela?',
    resposta: (
      <>
        Não. Em <Link to="/minha-conta">Minha conta</Link>, em &quot;Como você trabalha&quot;, escolha que a cozinha fica do
        lado do balcão. O botão &quot;Pronto&quot; passa a aparecer na própria tela de pedidos.
      </>
    ),
  },
  {
    pergunta: 'Fecho depois da meia-noite. O dia vira certo?',
    resposta:
      'Vira. O dia de trabalho vai até as 5h da manhã: um pedido à 1h ainda conta no dia anterior, a fila não some e a senha não recomeça no meio do turno. O dono pode mudar essa hora em Minha conta.',
  },
  {
    pergunta: 'Bebida também entra?',
    resposta:
      'Entra. No cadastro do produto, desmarque "Vai para a cozinha". A bebida soma na conta e no caixa, mas não aparece na fila da cozinha. Um pedido só de bebida já sai como pronto.',
  },
  {
    pergunta: 'A mesa vai pedindo aos poucos. Dá para somar tudo?',
    resposta:
      'Dá. No pedido, escolha "Mesa" e digite o número dela. Os pedidos da mesma mesa vão somando, e em Pedidos aparece a conta aberta de cada mesa, com o total para fechar de uma vez.',
  },
  {
    pergunta: 'Como fecho o caixa no fim do dia?',
    resposta: (
      <>
        Em <Link to="/caixa">Caixa</Link>: quanto entrou em Pix, dinheiro e cartão, o que ainda falta receber e o
        que foi cancelado depois de pago.
      </>
    ),
  },
  {
    pergunta: 'O som da cozinha não toca.',
    resposta:
      'O navegador só libera o som depois de um toque na tela. Abra a Cozinha e toque no aviso laranja "Toque aqui para ligar o som". Lá também dá para escolher o som bem alto, que corta o barulho da chapa. O volume do celular também precisa estar alto e fora do modo silencioso.',
  },
  {
    pergunta: 'Funciona no meu celular?',
    resposta:
      'Funciona no navegador do celular, do tablet ou do computador, sem instalar nada. No celular, use "Adicionar à tela inicial" no menu do navegador para abrir como um aplicativo.',
  },
  {
    pergunta: 'Esqueci a senha.',
    resposta: (
      <>
        Na tela de entrar, toque em <Link to="/esqueci-senha">Esqueci minha senha</Link>. Chega um código de 6 dígitos
        no seu e-mail. Se não chegar, fale com a equipe pelo contato abaixo.
      </>
    ),
  },
  {
    pergunta: 'Quanto custa?',
    resposta:
      'Nada. O Organiza+ é um projeto de estudantes da Unifor para ajudar pequenos negócios de comida. Sem mensalidade e sem cartão.',
  },
];

export default function Ajuda() {
  const { mode } = useTheme();
  // A Ajuda é pública. O grupo do WhatsApp só aparece para quem já usa o
  // sistema (logado); quem vem de fora fala com a equipe por e-mail.
  const { autenticado } = useAuth();

  return (
    <div className="min-h-svh bg-[var(--surface)]">
      <header className="max-w-2xl mx-auto flex items-center justify-between px-5 py-4">
        <Link to="/home" className="rounded-lg" aria-label="Organiza+, voltar ao painel">
          <img src={mode === 'dark' ? logoDark : logoLight} alt="" width="1372" height="434" className="h-8 w-auto" />
        </Link>
        <ThemeToggle />
      </header>

      <main className="max-w-2xl mx-auto px-5 pb-16 flex flex-col gap-8">
        <div className="flex flex-col gap-2 pt-4">
          <h1 className="text-3xl font-extrabold text-[var(--text-primary)]">Ajuda</h1>
          <p className="text-[var(--text-secondary)]">As dúvidas que os negócios mais perguntam.</p>
        </div>

        <section aria-labelledby="titulo-contato" className="rounded-2xl border-2 border-[var(--color-brand-orange)] p-5 flex flex-col gap-3">
          <h2 id="titulo-contato" className="text-xl font-bold text-[var(--text-primary)]">
            Travou no meio do movimento?
          </h2>
          <p className="text-[var(--text-secondary)]">Fale com a equipe do Organiza+.</p>
          <div className="flex flex-wrap gap-3">
            {autenticado && GRUPO_WHATSAPP && (
              <a
                href={GRUPO_WHATSAPP}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center min-h-12 rounded-xl px-5 font-bold text-[var(--sobre-destaque)]"
                style={{ backgroundColor: 'var(--color-accent-relatorios)' }}
              >
                Entrar no grupo de ajuda (WhatsApp)
              </a>
            )}
            <a
              href={`mailto:${EMAIL_CONTATO}?subject=${encodeURIComponent('Ajuda com o Organiza+')}`}
              className="inline-flex items-center min-h-12 rounded-xl px-5 font-bold border border-[var(--border-subtle)] text-[var(--text-primary)]"
            >
              Mandar e-mail
            </a>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            O Organiza+ é um projeto de estudantes da Unifor. Respondemos assim que possível, mas não temos atendimento 24 horas.
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            Enquanto isso, anote no papel e lance depois: nenhum pedido se perde.
          </p>
        </section>

        <div className="flex flex-col gap-3">
          {PERGUNTAS.map(({ pergunta, resposta }) => (
            <details key={pergunta} className="group rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-4">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-8 font-semibold text-[var(--text-primary)]">
                {pergunta}
                <span aria-hidden="true" className="text-[var(--text-secondary)] transition-transform group-open:rotate-45 text-xl">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed [&_a]:font-semibold [&_a]:text-[var(--texto-laranja)] [&_a]:underline">
                {resposta}
              </p>
            </details>
          ))}
        </div>

        <p className="text-sm text-[var(--text-secondary)]">
          <Link to="/privacidade" className="font-semibold text-[var(--texto-laranja)] underline-offset-4 hover:underline">
            Como cuidamos dos seus dados
          </Link>
        </p>
      </main>
    </div>
  );
}
