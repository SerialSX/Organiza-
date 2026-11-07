import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useRecarregarAoVoltar } from './useRecarregarAoVoltar';
import { listarPedidosAbertos, assinarPedidos } from '../services/pedidos';

export function usePedidosAbertos() {
  const { perfil } = useAuth();
  const negocioId = perfil?.negocio_id;
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [conectado, setConectado] = useState(true);
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
    const cancelar = assinarPedidos(
      negocioId,
      () => {
        clearTimeout(agendado.current);
        agendado.current = setTimeout(recarregar, 250);
      },
      setConectado,
    );
    return () => {
      clearTimeout(agendado.current);
      cancelar();
    };
  }, [negocioId, recarregar]);

  // Rede de segurança: mesmo com o tempo real ligado, confere a cada 30 s; com
  // ele caído, a cada 8 s, para a fila não ficar parada sem ninguém perceber.
  useEffect(() => {
    if (!negocioId) return undefined;
    const id = setInterval(recarregar, conectado ? 30000 : 8000);
    return () => clearInterval(id);
  }, [negocioId, conectado, recarregar]);

  useRecarregarAoVoltar(recarregar);

  return { pedidos, carregando, erro, recarregar, conectado };
}
