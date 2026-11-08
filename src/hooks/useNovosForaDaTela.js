import { useCallback, useEffect, useState } from 'react';

// Onde termina o cabeçalho fixo (menu do sistema ou do modo monitor): a faixa
// "+N pedidos novos" fica logo abaixo e o que está atrás dele não conta como
// visto.
function fimDoCabecalho() {
  let fim = 0;
  for (const h of document.querySelectorAll('header')) {
    const { position } = getComputedStyle(h);
    if (position !== 'sticky' && position !== 'fixed') continue;
    const r = h.getBoundingClientRect();
    if (r.height && r.top <= 1) fim = Math.max(fim, r.bottom);
  }
  return Math.round(fim);
}

export function useFimDoCabecalho() {
  const [fim, setFim] = useState(0);
  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => setFim(fimDoCabecalho()));
    };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, { passive: true });
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir);
    };
  }, []);
  return fim;
}

// Pedidos novos que ainda não apareceram na tela. A Cozinha marca como "não
// visto" o pedido que chega; quando o cartão dele aparece (metade dele, ou
// boa parte da tela), deixa de contar. Com outro app na frente, nada conta
// como visto: o cartão só "aparece" quando a pessoa volta.
// ids: os pedidos mostrados agora. topo: fim do cabeçalho fixo, em px.
export function useNovosForaDaTela(ids, topo) {
  const [naoVistos, setNaoVistos] = useState(() => new Set());
  const [visivel, setVisivel] = useState(() => document.visibilityState !== 'hidden');

  useEffect(() => {
    const aoMudar = () => setVisivel(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', aoMudar);
    return () => document.removeEventListener('visibilitychange', aoMudar);
  }, []);

  const marcarNovos = useCallback((novos) => {
    if (!novos.length) return;
    setNaoVistos((s) => new Set([...s, ...novos]));
  }, []);

  const chave = ids.filter((id) => naoVistos.has(id)).join(',');

  useEffect(() => {
    if (!chave || !visivel || typeof IntersectionObserver === 'undefined') return undefined;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (document.visibilityState === 'hidden') return;
        const vistos = entradas
          .filter((e) => e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= window.innerHeight * 0.4))
          .map((e) => e.target.dataset.pedidoId);
        if (vistos.length) {
          setNaoVistos((s) => {
            const resto = new Set(s);
            vistos.forEach((id) => resto.delete(id));
            return resto;
          });
        }
      },
      // Tira o cabeçalho de cima e a barra de baixo do celular.
      { rootMargin: `-${topo}px 0px -64px 0px`, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const id of chave.split(',')) {
      const el = document.querySelector(`[data-pedido-id="${id}"]`);
      if (el) observador.observe(el);
    }
    return () => observador.disconnect();
  }, [chave, topo, visivel]);

  const foraDaTela = chave ? chave.split(',') : [];
  return { naoVistos, foraDaTela, marcarNovos };
}

// Rola até o cartão, deixando o cabeçalho fixo de fora.
export function rolarAtePedido(id, topo) {
  const el = document.querySelector(`[data-pedido-id="${id}"]`);
  if (!el) return;
  const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - topo - 16, behavior: suave ? 'smooth' : 'auto' });
}
