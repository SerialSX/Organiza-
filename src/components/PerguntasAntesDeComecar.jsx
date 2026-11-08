import { EMAIL_CONTATO } from '../lib/contato';

// As dúvidas que os negócios tiveram na pesquisa de campo, respondidas na tela
// de criar conta. Só o que dá para garantir: nada de "configure em 5 minutos"
// ou "nunca trava".
const PERGUNTAS = [
  {
    pergunta: 'Quanto custa?',
    resposta: 'Nada. O Organiza+ é um projeto de estudantes da Unifor para ajudar pequenos negócios de comida. Sem mensalidade e sem cartão.',
  },
  {
    pergunta: 'Preciso comprar alguma coisa?',
    resposta: 'Não. Funciona no celular que você já tem, direto no navegador. Não precisa instalar nada.',
  },
  {
    pergunta: 'Quem cadastra o cardápio?',
    resposta:
      'Você pode começar com um cardápio pronto do seu tipo de negócio ou tirar foto do seu cardápio. Depois é só ajustar os preços.',
  },
  {
    pergunta: 'E se a internet cair?',
    resposta: 'Os pedidos ficam guardados no celular e são enviados sozinhos quando a internet voltar.',
  },
  {
    pergunta: 'Vou ter que largar o papel de uma vez?',
    resposta: 'Não. Teste num dia mais calmo, com o papel do lado. Você larga quando se sentir seguro.',
  },
  {
    pergunta: 'E os meus dados?',
    resposta: 'Só o seu negócio vê os seus pedidos. Não vendemos nada para ninguém, e você pode apagar sua conta quando quiser.',
  },
];

export default function PerguntasAntesDeComecar() {
  return (
    <section aria-labelledby="titulo-perguntas" className="flex flex-col gap-4">
      <h2 id="titulo-perguntas" className="text-xl font-bold text-[var(--text-primary)]">
        Perguntas que todo mundo faz antes de começar
      </h2>
      <dl className="flex flex-col gap-4">
        {PERGUNTAS.map(({ pergunta, resposta }) => (
          <div key={pergunta} className="flex flex-col gap-1">
            <dt className="font-semibold text-[var(--text-primary)]">{pergunta}</dt>
            <dd className="text-sm text-[var(--text-secondary)]">{resposta}</dd>
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <dt className="font-semibold text-[var(--text-primary)]">Ainda tem dúvida?</dt>
          <dd className="text-sm text-[var(--text-secondary)]">
            Escreva para{' '}
            <a href={`mailto:${EMAIL_CONTATO}`} className="font-semibold text-[var(--texto-laranja)] underline underline-offset-4 break-all">
              {EMAIL_CONTATO}
            </a>
            .
          </dd>
        </div>
      </dl>
    </section>
  );
}
