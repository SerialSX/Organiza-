import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useRecarregarAoVoltar } from './useRecarregarAoVoltar';
import { assinarPedidos, listarPedidosDoPeriodo } from '../services/pedidos';
import { listarContasDoDia } from '../services/mesas';
import { buscarEncerramento } from '../services/fimDoDia';
import { hojeNoNegocio, inicioDoDia } from '../lib/formatadores';

// Todos os pedidos do dia de trabalho (desde a virada), com valores, as
// contas de mesa fechadas no dia e o encerramento do dia (ou null): mapa das
// mesas e fechamento do caixa.
export function usePedidosDoDia(dia = null, { comContas = true, comEncerramento = true } = {}) {
  const { perfil } = useAuth();
  const negocioId = perfil?.negocio_id;
  const diaPedido = dia ?? hojeNoNegocio();
  const [estado, setEstado] = useState({ dia: null, pedidos: [], contas: [], encerramento: null, erro: '' });
  const [conectado, setConectado] = useState(false);
  const agendado = useRef(null);
  const seq = useRef(0);

  const recarregar = useCallback(async () => {
    if (!negocioId) return;
    const n = ++seq.current;
    const inicio = inicioDoDia(diaPedido);
    const fim = new Date(inicio.getTime() + 24 * 3600000);
    try {
      const [pedidos, contas, encerramento] = await Promise.all([
        listarPedidosDoPeriodo(inicio, fim),
        comContas ? listarContasDoDia(diaPedido) : [],
        comEncerramento ? buscarEncerramento(diaPedido) : null,
      ]);
      if (n !== seq.current) return;
      setEstado({ dia: diaPedido, pedidos, contas, encerramento, erro: '' });
    } catch (e) {
      if (n !== seq.current) return;
      setEstado((s) => ({ ...(s.dia === diaPedido ? s : {pedidos:[],contas:[],encerramento:null}), dia: diaPedido, erro: e.message }));
    }
  }, [diaPedido, negocioId, comContas, comEncerramento]);

  useEffect(() => {
    if (!negocioId) return undefined;
    recarregar();
    const cancelar = assinarPedidos(negocioId, (evento) => {
      const dias = [evento?.new?.dia, evento?.old?.dia].filter(Boolean);
      if (dias.length && !dias.includes(diaPedido)) return;
      clearTimeout(agendado.current);
      agendado.current = setTimeout(recarregar, 300);
    }, setConectado);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- contador de requisições, não uma referência DOM
      seq.current++;
      clearTimeout(agendado.current);
      cancelar();
    };
  }, [negocioId, recarregar, diaPedido]);

  // Com tempo real: conferência a cada 3 minutos. Sem ele: a cada 30 segundos.
  useEffect(() => {
    if (!negocioId) return undefined;
    const id = setInterval(recarregar, conectado ? 180000 : 30000);
    return () => clearInterval(id);
  }, [negocioId, recarregar, conectado]);

  useRecarregarAoVoltar(recarregar);

  return {
    pedidos: estado.dia === diaPedido ? estado.pedidos : [],
    contas: estado.dia === diaPedido ? estado.contas : [],
    encerramento: estado.dia === diaPedido ? estado.encerramento : null,
    carregando: estado.dia !== diaPedido,
    erro: estado.erro,
    recarregar,
  };
}
