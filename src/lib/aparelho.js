// O que dá para saber do aparelho pelo navegador: se o Organiza+ foi aberto
// dentro de outro app (o "navegador de dentro" do Instagram, do WhatsApp...),
// se é iPhone e se já está aberto pelo ícone na tela do celular.

// Navegador de dentro de um app: tem outra memória (pede para entrar de novo)
// e qualquer link novo substitui a tela do Organiza+.
const APPS = [
  ['Instagram', /Instagram/i],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS/i],
  ['WhatsApp', /WhatsApp/i],
  ['Google', /\bGSA\//],
  ['TikTok', /musical_ly|BytedanceWebview|TikTok/i],
  ['LinkedIn', /LinkedInApp/i],
  ['Snapchat', /Snapchat/i],
  ['Line', /\bLine\//],
];

// Devolve o nome do app ("Instagram") ou null. Um WebView de Android sem nome
// conhecido vira "outro app".
export function navegadorDeDentro(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  for (const [nome, padrao] of APPS) if (padrao.test(ua)) return nome;
  if (/Android/i.test(ua) && /;\s?wv\)/.test(ua)) return 'outro app';
  return null;
}

export function ehIphone(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return /iPhone|iPad|iPod/i.test(ua);
}

// Aberto pelo ícone na tela do celular (app instalado).
export function abertoComoApp() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

// Celular ou tablet (tela de toque).
export function aparelhoDeToque() {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

// Como sair do navegador de dentro, no texto de cada aparelho.
export function comoAbrirNoNavegador(ua) {
  return ehIphone(ua)
    ? 'Toque no menu (⋯ ou o ícone de compartilhar) e escolha "Abrir no Safari".'
    : 'Toque no menu (⋮) e escolha "Abrir no Chrome" (ou "Abrir no navegador").';
}

// Mostra o passo no fim das boas-vindas? Só em celular ou tablet, se ainda não
// abriu pelo ícone e não tocou em "Agora não" antes.
const CHAVE_DISPENSADO = 'organiza-tela-do-celular-dispensado';

export function dispensarTelaDoCelular() {
  try {
    localStorage.setItem(CHAVE_DISPENSADO, 'sim');
  } catch {
    // sem localStorage: aparece de novo, sem problema
  }
}

export function telaDoCelularDispensada() {
  try {
    return localStorage.getItem(CHAVE_DISPENSADO) === 'sim';
  } catch {
    return false;
  }
}

export function mostrarPassoDoCelular() {
  return aparelhoDeToque() && !abertoComoApp() && !telaDoCelularDispensada();
}
