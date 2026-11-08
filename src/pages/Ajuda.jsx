import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import ThemeToggle from '../components/ThemeToggle';
import logoDark from '../assets/logo.svg';
import logoLight from '../assets/logo-light.svg';
import { useAuth } from '../context/useAuth';
import { EMAIL_CONTATO, GRUPO_WHATSAPP } from '../lib/contato';
import { MODOS, modoDoNegocio } from '../lib/atendimento';
import Abas from '../components/ui/Abas';
import Tutorial from '../components/boasVindas/Tutorial';
import GuiaCozinha from '../components/boasVindas/GuiaCozinha';
import TelaDoCelular from '../components/TelaDoCelular';

const PERGUNTAS = [
  {
    pergunta: 'Quem cadastra o cardápio?',
    resposta: (
      <>
        Você, em poucos minutos: em <Link to="/produtos">Produtos</Link> dá para começar com um cardápio pronto
        (pastelaria, hamburgueria, espetaria, pizzaria ou bebidas) e só ajustar os preços. Já tem os produtos numa planilha? Toque em
        "Importar planilha": dá para baixar um modelo, e você confere tudo antes de salvar. Se preferir, a equipe do
        projeto cadastra junto com você.
      </>
    ),
  },
  {
    pergunta: 'Vendo pizza P, M e G (ou açaí de 300 e 500 ml). Cadastro três produtos?',
    resposta:
      'Não: é um produto só, com tamanhos. No cadastro, marque "Tem tamanhos?" e dê o preço de cada um (os botões "P · M · G" preenchem os nomes). Com os ingredientes, diga quanto vai em cada tamanho e o custo de cada um sai sozinho. Na tela de pedidos aparece um botão por tamanho, com o preço; a cozinha vê o tamanho grande, antes do nome. Acabou só a G? Desligue só ela, em Produtos ou nos Esgotados da Cozinha. Na planilha, use a coluna "Tamanho" e repita o nome numa linha para cada tamanho.',
  },
  {
    pergunta: 'Vendo pizza meio a meio. Como lanço?',
    resposta:
      'Em Produtos, marque "Pode ser meio a meio" em cada sabor (o cardápio pronto "Pizzaria" já vem marcado). Na primeira vez, o Organiza+ pergunta como você cobra: pelo sabor mais caro ou pela média dos dois. Dá para mudar depois em Minha conta, e vale só para os pedidos novos. No pedido, toque em "½ Meio a meio" no cartão da pizza, escolha o tamanho e a outra metade: só aparecem os sabores marcados do mesmo tamanho (G com G), e o que esgotou fica riscado. A cozinha vê "Meio a meio" com uma linha para cada metade e pode dizer o que faltou de qualquer um dos sabores. No relatório, cada sabor conta meia pizza.',
  },
  {
    pergunta: 'Como monto um combo (lanche, batata e bebida)?',
    resposta:
      'Em Produtos, na aba Combos, toque em "Montar o primeiro combo". Dê o nome e o preço do combo e escolha o produto de cada parte (com o tamanho, quando tem). Parte com uma opção já vem no combo; com "Deixar o cliente escolher" você põe as opções (Refrigerante ou Suco) e, se quiser, quanto uma delas custa a mais. A tela mostra quanto sai separado e quanto o cliente economiza. Em Pedidos, os combos ficam no topo: quem atende toca e escolhe as opções. Acabou um produto que sempre vem no combo? O combo fica esgotado sozinho. Acabou uma das opções? Só ela fica riscada. A cozinha vê o nome do combo com cada parte, e o relatório conta cada produto vendido ("X-Burguer: 12, sendo 5 em combo").',
  },
  {
    pergunta: 'Quero fazer promoção na terça ou no happy hour. Como?',
    resposta:
      'Em Produtos, na aba Promoções, crie a promoção: o nome, os dias da semana, o horário (ou o dia todo) e o preço de cada item, que pode ser produto, tamanho ou combo. Ela repete toda semana até você pausar ou apagar. Nos dias e horários dela, o preço muda sozinho em Pedidos, com o normal riscado e "Promoção até 19h" no cartão, e volta ao normal depois. Passando da meia-noite (das 22h às 2h) também dá. Pedido feito durante a promoção mantém o preço, mesmo editado depois. O relatório mostra quanto vendeu em cada promoção e quanto de desconto deu.',
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
        Não. Em <Link to="/minha-conta">Minha conta</Link>, em &quot;Como você atende&quot;, responda que você mesmo prepara ou
        que a cozinha fica do seu lado. O botão &quot;Pronto&quot; passa a aparecer na própria tela de pedidos.
      </>
    ),
  },
  {
    pergunta: 'Fecho depois da meia-noite. O dia vira certo?',
    resposta:
      'Vira. O dia de trabalho vai até as 5h da manhã: um pedido à 1h ainda conta no dia anterior, a fila não some e a senha não recomeça no meio do turno. Às 5h começa o dia novo e os números voltam para 001. Nada é cancelado sozinho: o que ficou aberto aparece como "Pendências do dia anterior" no Início.',
  },
  {
    pergunta: 'Bebida também entra?',
    resposta:
      'Entra. No cadastro do produto, desmarque "Vai para a cozinha". A bebida soma na conta e no caixa, mas não aparece na fila da cozinha. Um pedido só de bebida já sai como pronto.',
  },
  {
    pergunta: 'A mesa vai pedindo aos poucos. Dá para somar tudo?',
    resposta:
      'Dá. Em Minha conta, em "Como você atende", escolha Mesa (ou Balcão e mesa) e diga quantas mesas você tem. Em Pedidos aparece o mapa das mesas: toque na mesa livre (cinza) para lançar o pedido dela. A mesa fica laranja e mostra o total. Pediu mais? Toque nela e em "Lançar mais".',
  },
  {
    pergunta: 'Como fecho a mesa? E se quiserem dividir?',
    resposta:
      'Toque na mesa e em "Fechar mesa". Aparece o consumo, a taxa de serviço (se você cobra) e o total. Escolha como pagaram: "Um pagou tudo" (toque na forma), "Dividiram" (dividir igual entre as pessoas, ou cada um um valor, até o "Falta" chegar a zero) ou "Pagaram separado (sem anotar)", quando cada um pagou o seu e ninguém anotou a forma. Se um grupo vai embora antes, desmarque os pedidos que não são dele.',
  },
  {
    pergunta: 'O cliente não quer pagar a taxa de serviço. E agora?',
    resposta:
      'Ao fechar a mesa, toque em "Cliente não quis pagar o serviço". O total fica só com o consumo. No Caixa, a taxa aparece separada: ela é dos garçons e não entra no total vendido nem nos relatórios. A porcentagem muda em Minha conta → Como você atende.',
  },
  {
    pergunta: 'O cliente trocou de mesa, ou duas mesas se juntaram.',
    resposta:
      'Toque na mesa e em "Passar para outra mesa". Se a outra estiver livre, a conta só muda de lugar. Se estiver ocupada, o Organiza+ mostra os dois totais e pergunta se é para juntar as contas.',
  },
  {
    pergunta: 'Encheu e faltou mesa.',
    resposta:
      'No mapa, toque em "+ Mesa extra" e dê um nome (por exemplo, Varanda). Ela funciona como as outras e some do mapa quando a conta fecha. Se isso acontecer em 3 noites, o Organiza+ pergunta se você quer mais mesas no mapa. Também dá para mudar em Minha conta.',
  },
  {
    pergunta: 'Fechei a mesa errado (forma ou valor). Dá para desfazer?',
    resposta:
      'Dá. No Caixa, abra "Ver os recebimentos" e toque em "Desfazer" na conta da mesa. Ela volta a ficar aberta no mapa, para fechar de novo do jeito certo.',
  },
  {
    pergunta: 'Como fecho o caixa no fim do dia?',
    resposta: (
      <>
        Em <Link to="/caixa">Caixa</Link>, toque em "Encerrar o dia". Se ainda tiver pedido sem entregar ou conta sem
        receber, o Organiza+ mostra a lista do que resolver. Com tudo resolvido, o dia encerra e o Caixa mostra o resumo da
        noite: quanto entrou em Pix, dinheiro, crédito e débito, o que não foi recebido e o que falta devolver.
      </>
    ),
  },
  {
    pergunta: 'O cliente foi embora sem pagar.',
    resposta:
      'Na lista do "Encerrar o dia" (ou nas pendências do dia anterior), toque em "Foi embora sem pagar" na conta. Ela sai das contas abertas e fica no Caixa e nos relatórios como não recebido. Se ele voltar para pagar, toque em "Desfazer" no Caixa e receba a conta.',
  },
  {
    pergunta: 'Cancelei um pedido que já estava pago.',
    resposta:
      'Depois do motivo, o Organiza+ pergunta se você devolveu o dinheiro. "Sim, devolvi": fica registrado. "Ainda vou devolver": o valor aparece em "A devolver" no Caixa até você tocar em "Devolvi".',
  },
  {
    pergunta: 'Lancei um pedido depois de encerrar o dia.',
    resposta:
      'Sem problema: o dia reabre sozinho e o pedido entra no caixa da noite. Quando terminar, encerre o dia de novo.',
  },
  {
    pergunta: 'O som da cozinha não toca.',
    resposta:
      'O navegador só libera o som depois de um toque na tela. Abra a Cozinha e toque no aviso laranja "Toque aqui para ligar o som". Lá também dá para escolher o som bem alto, que corta o barulho da chapa. O volume do celular também precisa estar alto e fora do modo silencioso. E deixe o aparelho da cozinha só com o Organiza+ aberto: com outro app na frente, o som não toca.',
  },
  {
    pergunta: 'Por que às vezes o som é forte e às vezes é só um "tic"?',
    resposta:
      'Com a fila vazia, o pedido novo toca o som forte: a cozinha pode estar distraída. Se já tem pedido na tela, toca só um "tic" baixo, no máximo um a cada 30 segundos, para não virar barulho na correria. Pedido alterado ou cancelado sempre toca dois bipes. O "Pronto" que você mesmo toca não faz som.',
  },
  {
    pergunta: 'Num celular pequeno, os pedidos novos ficam escondidos embaixo.',
    resposta:
      'Quando chega pedido que não está aparecendo na tela, surge em cima a faixa "+2 pedidos novos". Toque nela para ir até eles. Se preferir cartões grandes, escolha em "Pedidos na tela" quantos ver por vez (1, 2 ou 3); o resto aparece como "+5 na fila" e o próximo entra quando você toca em Pronto.',
  },
  {
    pergunta: 'Funciona no meu celular?',
    resposta:
      'Funciona no navegador do celular, do tablet ou do computador, sem instalar nada. Para achar mais fácil, coloque o ícone do Organiza+ na tela do celular: veja "Colocar na tela do celular", aqui na Ajuda.',
  },
  {
    pergunta: 'Abri pelo link do WhatsApp (ou do Instagram) e toda hora pede para entrar.',
    resposta:
      'Esses apps abrem o link num navegador próprio, que não guarda a sua entrada. Toque no menu do app e escolha "Abrir no Chrome" (no iPhone, "Abrir no Safari"). Melhor ainda: depois de abrir no navegador, coloque o Organiza+ na tela do celular.',
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

// Os passo a passos das perguntas de boas-vindas, para ver de novo.
function ComoFunciona({ modoInicial }) {
  const [modo, setModo] = useState(modoInicial);
  const [vez, setVez] = useState(0);
  return (
    <section id="como-funciona" aria-labelledby="titulo-como-funciona" className="scroll-mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 flex flex-col gap-4">
      <h2 id="titulo-como-funciona" className="text-xl font-bold text-[var(--text-primary)]">
        Veja como funciona
      </h2>
      <Abas opcoes={MODOS.map((m) => ({ id: m.id, rotulo: m.rotulo }))} valor={modo} onMudar={setModo} rotulo="Jeito de atender" cor="var(--color-brand-orange)" />
      {/* key: trocar de jeito (ou "Ver de novo") volta para o passo 1 */}
      <Tutorial key={`${modo}-${vez}`} modo={modo} rotuloFim="Ver de novo" onFim={() => setVez((v) => v + 1)} />
    </section>
  );
}

export default function Ajuda() {
  const { mode } = useTheme();
  // A Ajuda é pública. O grupo do WhatsApp só aparece para quem já usa o
  // sistema (logado); quem vem de fora fala com a equipe por e-mail.
  const { autenticado, perfil } = useAuth();
  const { hash } = useLocation();
  const [guiaAberto, setGuiaAberto] = useState(hash === '#aparelho-da-cozinha');
  const [celularAberto, setCelularAberto] = useState(hash === '#tela-do-celular');

  // Link vindo de outra tela (ex.: Minha conta → ver o passo a passo).
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

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

        <section
          id="travou"
          aria-labelledby="titulo-contato"
          className="scroll-mt-6 rounded-2xl border-2 border-[var(--color-brand-orange)] p-5 flex flex-col gap-3"
        >
          <h2 id="titulo-contato" className="text-xl font-bold text-[var(--text-primary)]">
            Travou? Veja o que fazer
          </h2>
          <ol className="flex flex-col gap-3 text-[var(--text-primary)]">
            <li>
              <strong>1. Puxe a tela para baixo</strong> ou feche e abra o Organiza+ de novo. Os pedidos que já saíram não se
              perdem: eles ficam guardados na internet.
            </li>
            <li>
              <strong>2. Sem internet?</strong> Pode continuar lançando: os pedidos ficam guardados no celular e saem sozinhos
              quando a internet voltar, mesmo se você fechar o Organiza+. Não lance de novo.
            </li>
            <li>
              <strong>3. Ainda não voltou?</strong> Anote no papel por enquanto. Depois, lance os pedidos do papel no Organiza+
              para o caixa da noite ficar certo.
            </li>
          </ol>
          <p className="font-semibold text-[var(--text-primary)]">Continua travado? Fale com a equipe do Organiza+.</p>
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
        </section>

        <ComoFunciona modoInicial={autenticado ? modoDoNegocio(perfil) : 'balcao'} />

        <details
          id="aparelho-da-cozinha"
          open={guiaAberto}
          onToggle={(e) => setGuiaAberto(e.currentTarget.open)}
          className="scroll-mt-6 group rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-4"
        >
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-8 text-xl font-bold text-[var(--text-primary)]">
            Como ligar o aparelho da cozinha
            <span aria-hidden="true" className="text-[var(--text-secondary)] transition-transform group-open:rotate-45 text-xl">
              +
            </span>
          </summary>
          <div className="mt-4">
            {guiaAberto && <GuiaCozinha negocioId={autenticado ? perfil?.negocio_id : null} />}
          </div>
        </details>

        <details
          id="tela-do-celular"
          open={celularAberto}
          onToggle={(e) => setCelularAberto(e.currentTarget.open)}
          className="scroll-mt-6 group rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-4"
        >
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-8 text-xl font-bold text-[var(--text-primary)]">
            Colocar na tela do celular
            <span aria-hidden="true" className="text-[var(--text-secondary)] transition-transform group-open:rotate-45 text-xl">
              +
            </span>
          </summary>
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-[var(--text-secondary)]">
              O ícone do Organiza+ fica junto com o WhatsApp e abre com um toque, sem procurar o endereço.
            </p>
            {celularAberto && <TelaDoCelular />}
          </div>
        </details>

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
