import { useEffect, useState } from 'react';

// Relógio que atualiza sozinho, para tempos de espera na tela da cozinha.
export function useAgora(intervaloMs = 30000) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);

  return agora;
}
