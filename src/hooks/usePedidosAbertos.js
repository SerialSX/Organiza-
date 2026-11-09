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
  const seq = useRef(0);

  const recarregar = useCallback(async () => {
    if (!negocioId) return;
    const n = ++seq.current;
    try {
      const novos = await listarPedidosAbertos();
      if (n !== seq.current) return;
      setPedidos(novos);
      setErro('');
    } catch (e) {
      if (n !== seq.current) return;
      setErro(e.message);
    } finally {
      if (n === seq.current) setCarregando(false);
    }
  }, [negocioId]);

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
      // eslint-disable-next-line react-hooks/exhaustive-deps -- contador de requisições, não uma referência DOM
      seq.current++;
      clearTimeout(agendado.current);
      cancelar();
    };
  }, [negocioId, recarregar]);

  // Com tempo real confere a cada 3 minutos; desconectado, a cada 30 segundos.
  useEffect(() => {
    if (!negocioId) return undefined;
    const id = setInterval(recarregar, conectado ? 180000 : 30000);
    return () => clearInterval(id);
  }, [negocioId, conectado, recarregar]);

  useRecarregarAoVoltar(recarregar);

  return { pedidos, carregando, erro, recarregar, conectado };
}
