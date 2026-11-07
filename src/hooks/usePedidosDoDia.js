import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useRecarregarAoVoltar } from './useRecarregarAoVoltar';
import { assinarPedidos, listarPedidosDoPeriodo } from '../services/pedidos';
import { hojeNoNegocio, inicioDoDia } from '../lib/formatadores';

// Todos os pedidos do dia de trabalho (desde a virada), com valores: conta
// das mesas e fechamento do caixa.
export function usePedidosDoDia(dia = null) {
  const { perfil } = useAuth();
  const negocioId = perfil?.negocio_id;
  const diaPedido = dia ?? hojeNoNegocio();
  const [estado, setEstado] = useState({ dia: null, pedidos: [], erro: '' });
  const agendado = useRef(null);

  const recarregar = useCallback(async () => {
    const inicio = inicioDoDia(diaPedido);
    const fim = new Date(inicio.getTime() + 24 * 3600000);
    try {
      const pedidos = await listarPedidosDoPeriodo(inicio, fim);
      setEstado({ dia: diaPedido, pedidos, erro: '' });
    } catch (e) {
      setEstado((s) => ({ ...s, dia: diaPedido, erro: e.message }));
    }
  }, [diaPedido]);

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

  useRecarregarAoVoltar(recarregar);

  return { pedidos: estado.pedidos, carregando: estado.dia !== diaPedido, erro: estado.erro, recarregar };
}
