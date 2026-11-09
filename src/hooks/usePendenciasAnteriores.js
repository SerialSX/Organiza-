import { useCallback, useEffect, useRef, useState } from 'react';
import { hojeNoNegocio } from '../lib/formatadores';
import { useAuth } from '../context/useAuth';
import { useRecarregarAoVoltar } from './useRecarregarAoVoltar';
import { assinarPedidos, listarPendenciasAnteriores } from '../services/pedidos';

// Pedidos de dias anteriores que ainda não foram entregues ou recebidos
// ("Pendências do dia anterior"), com valores.
export function usePendenciasAnteriores() {
  const { perfil } = useAuth();
  const negocioId = perfil?.negocio_id;
  const [estado, setEstado] = useState({ pedidos: [], carregando: true, erro: '' });
  const [conectado, setConectado] = useState(false);
  const agendado = useRef(null);
  const seq = useRef(0);
  const diaDosDados = useRef(null);

  const recarregar = useCallback(async () => {
    if (!negocioId) return;
    const n = ++seq.current;
    const dia = hojeNoNegocio();
    try {
      const pedidos = await listarPendenciasAnteriores();
      if (n !== seq.current) return;
      diaDosDados.current = dia;
      setEstado({ pedidos, carregando: false, erro: '' });
    } catch (e) {
      if (n !== seq.current) return;
      setEstado((s) => ({ pedidos: diaDosDados.current === dia ? s.pedidos : [], carregando: false, erro: e.message }));
    }
  }, [negocioId]);

  useEffect(() => {
    if (!negocioId) return undefined;
    recarregar();
    const cancelar = assinarPedidos(negocioId, (evento) => {
      const dias = [evento?.new?.dia, evento?.old?.dia].filter(Boolean);
      if (dias.length && dias.every(dia=>dia >= hojeNoNegocio())) return;
      clearTimeout(agendado.current);
      agendado.current = setTimeout(recarregar, 300);
    }, setConectado);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- contador de requisições, não uma referência DOM
      seq.current++;
      clearTimeout(agendado.current);
      cancelar();
    };
  }, [negocioId, recarregar]);

  // O dia vira às 5h com a tela aberta: confere de vez em quando.
  useEffect(() => {
    if (!negocioId) return undefined;
    const id = setInterval(recarregar, conectado ? 180000 : 30000);
    return () => clearInterval(id);
  }, [negocioId, recarregar, conectado]);

  useRecarregarAoVoltar(recarregar);

  return { ...estado, recarregar };
}
