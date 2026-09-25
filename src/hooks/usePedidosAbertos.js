import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { listarPedidosAbertos, assinarPedidos } from '../services/pedidos';

export function usePedidosAbertos() {
  const { perfil } = useAuth();
  const negocioId = perfil?.negocio_id;
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const agendado = useRef(null);

  const recarregar = useCallback(async () => {
    try {
      setPedidos(await listarPedidosAbertos());
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
    // Um pedido novo gera vários eventos (pedido + itens); agrupa num recarregamento só.
    const cancelar = assinarPedidos(negocioId, () => {
      clearTimeout(agendado.current);
      agendado.current = setTimeout(recarregar, 250);
    });
    return () => {
      clearTimeout(agendado.current);
      cancelar();
    };
  }, [negocioId, recarregar]);

  return { pedidos, carregando, erro, recarregar };
}
