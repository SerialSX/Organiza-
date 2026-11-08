import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertIcon } from './icons/AppIcons';
import { comoAbrirNoNavegador, navegadorDeDentro } from '../lib/aparelho';

const CHAVE = 'organiza-aviso-navegador-de-dentro';

function jaFechou() {
  try {
    return sessionStorage.getItem(CHAVE) === 'sim';
  } catch {
    return false;
  }
}

// Aberto dentro do Instagram, WhatsApp, Google...: esse navegador tem outra
// memória (pede para entrar de novo) e qualquer link novo substitui a tela do
// Organiza+. O aviso explica como abrir no Chrome ou no Safari. Na página do
// cliente (QR code) não aparece: lá ninguém precisa entrar.
export default function AvisoNavegadorDeDentro() {
  const { pathname } = useLocation();
  const [app] = useState(() => navegadorDeDentro());
  const [fechado, setFechado] = useState(jaFechou);
  const [copiado, setCopiado] = useState(false);

  if (!app || fechado || pathname.startsWith('/p/')) return null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(window.location.origin + pathname);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  function fechar() {
    try {
      sessionStorage.setItem(CHAVE, 'sim');
    } catch {
      // fecha só nesta tela
    }
    setFechado(true);
  }

  return (
    <div
      role="region"
      aria-label="Aviso sobre o navegador"
      className="flex flex-col gap-2 px-4 py-3 text-sm text-[var(--text-primary)] bg-[color-mix(in_srgb,var(--color-brand-orange)_24%,var(--surface))] border-b border-[var(--color-brand-orange)]"
    >
      <p className="flex items-start gap-2 font-semibold">
        <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--texto-laranja)]" />
        <span>
          Você abriu o Organiza+ dentro do {app}. Assim você pode precisar entrar de novo toda hora. {comoAbrirNoNavegador()}
        </span>
      </p>
      <div className="flex flex-wrap gap-2 pl-7">
        <button
          type="button"
          onClick={copiar}
          className="min-h-11 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-alt)] px-3 font-semibold"
        >
          {copiado ? 'Endereço copiado' : 'Copiar o endereço'}
        </button>
        <button type="button" onClick={fechar} className="min-h-11 rounded-lg px-3 font-semibold underline">
          Entendi
        </button>
      </div>
    </div>
  );
}
