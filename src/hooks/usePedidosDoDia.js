import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useRecarregarAoVoltar } from './useRecarregarAoVoltar';
import { assinarPedidos, listarPedidosDoPeriodo } from '../services/pedidos';
import { listarContasDoDia } from '../services/mesas';
import { hojeNoNegocio, inicioDoDia } from '../lib/formatadores';

// Todos os pedidos do dia de trabalho (desde a virada), com valores, e as
// contas de mesa fechadas no dia: mapa das mesas e fechamento do caixa.
export function usePedidosDoDia(dia = null) {
  const { perfil } = useAuth();
  const negocioId = perfil?.negocio_id;
  const diaPedido = dia ?? hojeNoNegocio();
  const [estado, setEstado] = useState({ dia: null, pedidos: [], contas: [], erro: '' });
  const agendado = useRef(null);

  const recarregar = useCallback(async () => {
    const inicio = inicioDoDia(diaPedido);
    const fim = new Date(inicio.getTime() + 24 * 3600000);
    try {
      const [pedidos, contas] = await Promise.all([listarPedidosDoPeriodo(inicio, fim), listarContasDoDia(diaPedido)]);
      setEstado({ dia: diaPedido, pedidos, contas, erro: '' });
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

  // Rede de segurança, como na fila: o tempo real pode cair sem aviso; a cada
  // 30 s confere de novo (caixa e contas das mesas não ficam velhos).
  useEffect(() => {
    if (!negocioId) return undefined;
    const id = setInterval(recarregar, 30000);
    return () => clearInterval(id);
  }, [negocioId, recarregar]);

  useRecarregarAoVoltar(recarregar);

  return { pedidos: estado.pedidos, contas: estado.contas, carregando: estado.dia !== diaPedido, erro: estado.erro, recarregar };
}
