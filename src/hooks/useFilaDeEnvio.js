import { useCallback, useEffect, useRef, useState } from 'react';
import { criarPedido } from '../services/pedidos';
import { assinarFila, lerFila, marcarErroNaFila, tirarDaFila } from '../services/filaDeEnvio';

const INTERVALO_MS = 10000;

// Reenvia sozinho os pedidos guardados sem internet: quando a conexão volta,
// a cada 10 segundos enquanto houver algum e quando o atendente pede.
// onEnviado(pedido, envio) avisa a tela para mostrar a senha que saiu.
export function useFilaDeEnvio({ negocioId, usuarioId, onEnviado }) {
  const [fila, setFila] = useState(() => lerFila(negocioId));
  const tentando = useRef(false);
  const aoEnviar = useRef(onEnviado);

  useEffect(() => {
    aoEnviar.current = onEnviado;
  }, [onEnviado]);

  useEffect(() => assinarFila(() => setFila(lerFila(negocioId))), [negocioId]);

  const tentarAgora = useCallback(async () => {
    if (tentando.current) return;
    tentando.current = true;
    try {
      for (const envio of lerFila(negocioId)) {
        if (envio.erro) continue;
        try {
          const pedido = await criarPedido({
            negocioId,
            usuarioId,
            itens: envio.itens,
            chaveEnvio: envio.chaveEnvio,
            mesa: envio.mesa ?? null,
            identificacao: envio.identificacao,
            formaPagamento: envio.formaPagamento,
          });
          tirarDaFila(negocioId, envio.chaveEnvio);
          aoEnviar.current?.(pedido, envio);
        } catch (e) {
          // Ainda sem internet: para e tenta mais tarde, na mesma ordem.
          if (e.semInternet) break;
          marcarErroNaFila(negocioId, envio.chaveEnvio, e.message);
        }
      }
    } finally {
      tentando.current = false;
    }
  }, [negocioId, usuarioId]);

  const pendentes = fila.filter((e) => !e.erro).length;

  useEffect(() => {
    if (!pendentes) return undefined;
    const id = setInterval(tentarAgora, INTERVALO_MS);
    window.addEventListener('online', tentarAgora);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', tentarAgora);
    };
  }, [pendentes, tentarAgora]);

  const descartar = useCallback((chaveEnvio) => tirarDaFila(negocioId, chaveEnvio), [negocioId]);

  return { fila, tentarAgora, descartar };
}
