import { useCallback, useEffect, useRef, useState } from 'react';
import { criarPedido } from '../services/pedidos';
import { assinarFila, lerFila, marcarErroNaFila, tirarDaFila } from '../services/filaDeEnvio';
import { hojeNoNegocio } from '../lib/formatadores';

const INTERVALO_MS = 10000;
const EVENTO_ENVIADO = 'organiza-fila-enviado';
export const ERRO_OUTRO_DIA = 'Pedido de outro dia: confira com o cliente e descarte.';

// Um reenvio por vez no aparelho, mesmo com o hook em mais de um lugar (o
// AppShell de toda tela e a tela de Pedidos).
let tentando = false;

// Guardado num dia de trabalho que já passou: a senha sairia no dia de hoje,
// para um cliente que provavelmente já foi embora. Para e espera o atendente.
function deOutroDia(envio) {
  return Boolean(envio.guardadoEm) && hojeNoNegocio(new Date(envio.guardadoEm)) !== hojeNoNegocio();
}

// Reenvia sozinho os pedidos guardados sem internet: quando a conexão volta,
// a cada 10 segundos enquanto houver algum e quando o atendente pede. Roda em
// qualquer tela do sistema, não só em Pedidos.
// onEnviado(pedido, envio) avisa a tela para mostrar a senha que saiu, seja
// qual for o lugar do aparelho que fez o reenvio.
export function useFilaDeEnvio({ negocioId, usuarioId, onEnviado }) {
  const [fila, setFila] = useState(() => lerFila(negocioId));
  const aoEnviar = useRef(onEnviado);

  useEffect(() => {
    aoEnviar.current = onEnviado;
  }, [onEnviado]);

  useEffect(() => {
    // Lê de novo ao assinar: o aviso do AppShell (filho desta tela) roda os
    // efeitos antes e pode ter mexido na fila antes desta assinatura existir.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com o localStorage
    setFila(lerFila(negocioId));
    return assinarFila(() => setFila(lerFila(negocioId)));
  }, [negocioId]);

  useEffect(() => {
    function aoSair(e) {
      if (e.detail.negocioId === negocioId) aoEnviar.current?.(e.detail.pedido, e.detail.envio);
    }
    window.addEventListener(EVENTO_ENVIADO, aoSair);
    return () => window.removeEventListener(EVENTO_ENVIADO, aoSair);
  }, [negocioId]);

  const tentarAgora = useCallback(async () => {
    if (tentando || !negocioId) return;
    tentando = true;
    try {
      for (const envio of lerFila(negocioId)) {
        if (envio.erro) continue;
        if (deOutroDia(envio)) {
          marcarErroNaFila(negocioId, envio.chaveEnvio, ERRO_OUTRO_DIA);
          continue;
        }
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
          window.dispatchEvent(new CustomEvent(EVENTO_ENVIADO, { detail: { negocioId, pedido, envio } }));
        } catch (e) {
          // Ainda sem internet: para e tenta mais tarde, na mesma ordem.
          if (e.semInternet) break;
          marcarErroNaFila(negocioId, envio.chaveEnvio, e.message);
        }
      }
    } finally {
      tentando = false;
    }
  }, [negocioId, usuarioId]);

  const pendentes = fila.filter((e) => !e.erro).length;

  useEffect(() => {
    if (!pendentes) return undefined;
    // Ao abrir a tela com pedido guardado (ex.: o aparelho reiniciou), já tenta.
    tentarAgora();
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
