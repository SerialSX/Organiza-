import { useEffect, useState } from 'react';
import Botao from './ui/Botao';
import Aviso from './ui/Aviso';
import { PhoneIcon, ShareIcon } from './icons/AppIcons';
import { abertoComoApp, comoAbrirNoNavegador, ehIphone, navegadorDeDentro } from '../lib/aparelho';
import { assinarInstalacao, instalar, podeInstalarComUmToque } from '../lib/instalar';

const ACCENT = 'var(--color-brand-orange)';

function Passos({ children }) {
  return <ol className="flex flex-col gap-3 text-[var(--text-primary)]">{children}</ol>;
}

function Passo({ numero, children }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-[var(--sobre-destaque)]"
        style={{ backgroundColor: ACCENT }}
        aria-hidden="true"
      >
        {numero}
      </span>
      <span className="pt-1">{children}</span>
    </li>
  );
}

// "Deixe o Organiza+ na tela do seu celular": o ícone laranja junto com o
// WhatsApp, para achar no dia seguinte sem digitar endereço. Não faz o
// sistema abrir sem internet.
// - Aberto pelo ícone: já está lá.
// - Dentro de outro app (Instagram, WhatsApp...): primeiro abrir no navegador.
// - Chrome do Android: um botão, e o celular pergunta "Instalar?".
// - iPhone: o passo a passo (o iPhone não deixa ter o botão).
// - Outros: o caminho pelo menu do navegador.
export default function TelaDoCelular() {
  const [umToque, setUmToque] = useState(podeInstalarComUmToque);
  const [instalado, setInstalado] = useState(abertoComoApp);
  const [recusou, setRecusou] = useState(false);

  useEffect(() => assinarInstalacao(() => setUmToque(podeInstalarComUmToque())), []);

  async function colocar() {
    const aceitou = await instalar();
    if (aceitou) setInstalado(true);
    else setRecusou(true);
  }

  if (instalado) {
    return (
      <Aviso tipo="sucesso">
        Pronto: o Organiza+ está na tela do seu celular. Da próxima vez, abra pelo ícone laranja.
      </Aviso>
    );
  }

  const app = navegadorDeDentro();
  if (app) {
    return (
      <Aviso tipo="info">
        Você abriu o Organiza+ dentro do {app === 'outro app' ? 'outro app' : app}. Daqui não dá para colocar na tela do celular.{' '}
        {comoAbrirNoNavegador()} Depois, abra a Ajuda e faça este passo de lá.
      </Aviso>
    );
  }

  if (ehIphone()) {
    return (
      <Passos>
        <Passo numero="1">
          Toque no ícone de compartilhar <ShareIcon className="inline h-5 w-5 align-text-bottom" />{' '}
          <span className="text-[var(--text-secondary)]">(o quadrado com a seta, embaixo ou em cima da tela)</span>.
        </Passo>
        <Passo numero="2">
          Desça e toque em <strong>Adicionar à Tela de Início</strong>.
        </Passo>
        <Passo numero="3">
          Toque em <strong>Adicionar</strong>. O ícone do Organiza+ aparece junto com os seus apps.
        </Passo>
      </Passos>
    );
  }

  if (umToque) {
    return (
      <div className="flex flex-col gap-2">
        <Botao tamanho="grande" cor={ACCENT} className="self-start" onClick={colocar}>
          <PhoneIcon className="h-5 w-5" />
          Colocar na tela do celular
        </Botao>
        <p className="text-sm text-[var(--text-secondary)]">O celular pergunta se quer instalar: toque em Instalar.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {recusou && <p className="text-sm text-[var(--text-secondary)]">Tudo bem. Se mudar de ideia, faça assim:</p>}
      <Passos>
        <Passo numero="1">
          Toque no menu do navegador <strong aria-hidden="true">⋮</strong>
          <span className="sr-only">(os três pontinhos)</span>, no canto de cima.
        </Passo>
        <Passo numero="2">
          Toque em <strong>Adicionar à tela inicial</strong> ou <strong>Instalar app</strong>.
        </Passo>
        <Passo numero="3">
          Confirme. O ícone do Organiza+ aparece junto com os seus apps.
        </Passo>
      </Passos>
    </div>
  );
}
