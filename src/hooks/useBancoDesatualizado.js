import { useEffect, useState } from 'react';
import { bancoDesatualizado } from '../services/versaoDoBanco';

export function useBancoDesatualizado() {
  const [desatualizado, setDesatualizado] = useState(false);

  useEffect(() => {
    let ativo = true;
    bancoDesatualizado()
      .then((r) => ativo && setDesatualizado(r))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  return desatualizado;
}
