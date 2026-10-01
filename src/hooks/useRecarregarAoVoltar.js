import { useEffect } from 'react';

// Tablet que apagou a tela ou perdeu o Wi-Fi pode ter perdido pedidos novos:
// ao voltar, busca a lista de novo.
export function useRecarregarAoVoltar(recarregar) {
  useEffect(() => {
    function aoVoltar() {
      if (document.visibilityState === 'visible') recarregar();
    }
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('online', recarregar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('online', recarregar);
    };
  }, [recarregar]);
}
