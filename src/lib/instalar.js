// "Colocar na tela do celular" no Chrome do Android: o navegador avisa que dá
// para instalar (beforeinstallprompt) logo ao abrir a página, antes de
// qualquer tela pedir. Este módulo guarda esse aviso para o botão usar depois.
// No iPhone o evento não existe: lá a tela mostra o passo a passo.
let pedido = null;
const EVENTO = 'organiza-instalar';

export function escutarInstalacao() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pedido = e;
    window.dispatchEvent(new Event(EVENTO));
  });
  window.addEventListener('appinstalled', () => {
    pedido = null;
    window.dispatchEvent(new Event(EVENTO));
  });
}

export function podeInstalarComUmToque() {
  return pedido !== null;
}

export function assinarInstalacao(callback) {
  window.addEventListener(EVENTO, callback);
  return () => window.removeEventListener(EVENTO, callback);
}

// Abre a pergunta "Instalar?" do celular. Devolve true se a pessoa aceitou.
export async function instalar() {
  if (!pedido) return false;
  const atual = pedido;
  pedido = null;
  window.dispatchEvent(new Event(EVENTO));
  await atual.prompt();
  const { outcome } = await atual.userChoice;
  return outcome === 'accepted';
}
