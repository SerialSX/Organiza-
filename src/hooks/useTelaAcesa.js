import { useEffect } from 'react';

// Pede ao navegador para não apagar a tela (tablet da cozinha fica parado na
// bancada). O pedido cai quando a aba sai de foco, então é refeito na volta.
export function useTelaAcesa() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return undefined;

    let trava = null;
    let ativo = true;

    async function pedir() {
      try {
        const nova = await navigator.wakeLock.request('screen');
        if (ativo) trava = nova;
        else nova.release();
      } catch {
        // bateria fraca ou permissão negada: segue sem manter a tela acesa
      }
    }

    function aoVoltar() {
      if (document.visibilityState === 'visible') pedir();
    }

    pedir();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      ativo = false;
      document.removeEventListener('visibilitychange', aoVoltar);
      trava?.release();
    };
  }, []);
}
