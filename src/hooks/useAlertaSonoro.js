import { useEffect, useState } from 'react';
import { audioSuportado, liberarAudio } from '../lib/alertaSonoro';

// O som da Cozinha fica sempre ligado, mas o navegador só deixa tocar depois
// que alguém toca na página. Até lá, bloqueado é true e a tela pede esse toque.
export function useAlertaSonoro() {
  const [liberado, setLiberado] = useState(false);

  useEffect(() => {
    if (!audioSuportado()) return undefined;
    let ativo = true;
    const tentar = () =>
      liberarAudio().then((ok) => {
        if (ativo) setLiberado(ok);
      });

    // Vindo de outra tela do sistema, o navegador já libera o som; abrindo a
    // Cozinha direto (favorito no tablet), só depois do primeiro toque.
    if (navigator.userActivation?.hasBeenActive ?? true) tentar();
    const eventos = ['click', 'touchend', 'keydown'];
    eventos.forEach((evento) => window.addEventListener(evento, tentar));
    return () => {
      ativo = false;
      eventos.forEach((evento) => window.removeEventListener(evento, tentar));
    };
  }, []);

  return { bloqueado: audioSuportado() && !liberado };
}
