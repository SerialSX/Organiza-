import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { listarProdutos, assinarProdutos } from '../services/produtos';

export function useProdutos() {
  const { perfil } = useAuth();
  const negocioId = perfil?.negocio_id;
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const recarregar = useCallback(async () => {
    try {
      setProdutos(await listarProdutos());
      setErro('');
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!negocioId) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial vinda de fora do React
    recarregar();
    return assinarProdutos(negocioId, recarregar);
  }, [negocioId, recarregar]);

  return { produtos, carregando, erro, recarregar };
}
