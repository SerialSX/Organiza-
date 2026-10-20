// Cor de destaque (fundo, borda) → versão para texto e ícone, que no tema
// claro é mais escura para ter contraste (ver --texto-* em index.css).
export function corDeTexto(destaque) {
  return destaque
    .replace('--color-brand-orange', '--texto-laranja')
    .replace('--color-accent-', '--texto-');
}
