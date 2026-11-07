import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useRecarregarAoVoltar } from './useRecarregarAoVoltar';
import { assinarPedidos, listarPendenciasAnteriores } from '../services/pedidos';

// Pedidos de dias anteriores que ainda não foram entregues ou recebidos
// ("Pendências do dia anterior"), com valores.
export function usePendenciasAnteriores() {
  const { perfil } = useAuth();
  const negocioId = perfil?.negocio_id;
  const [estado, setEstado] = useState({ pedidos: [], carregando: true, erro: '' });
  const agendado = useRef(null);

  const recarregar = useCallback(async () => {
    try {
      const pedidos = await listarPendenciasAnteriores();
      setEstado({ pedidos, carregando: false, erro: '' });
    } catch (e) {
      setEstado((s) => ({ ...s, carregando: false, erro: e.message }));
    }
  }, []);

  useEffect(() => {
    if (!negocioId) return undefined;
    recarregar();
    const cancelar = assinarPedidos(negocioId, () => {
      clearTimeout(agendado.current);
      agendado.current = setTimeout(recarregar, 300);
    });
    return () => {
      clearTimeout(agendado.current);
      cancelar();
    };
  }, [negocioId, recarregar]);

  // O dia vira às 5h com a tela aberta: confere de vez em quando.
  useEffect(() => {
    if (!negocioId) return undefined;
    const id = setInterval(recarregar, 60000);
    return () => clearInterval(id);
  }, [negocioId, recarregar]);

  useRecarregarAoVoltar(recarregar);

  return { ...estado, recarregar };
}
