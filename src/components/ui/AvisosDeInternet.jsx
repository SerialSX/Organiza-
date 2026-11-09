import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WifiOffIcon } from '../icons/AppIcons';
import { useFilaDeEnvio } from '../../hooks/useFilaDeEnvio';
import { useFimDoCabecalho } from '../../hooks/useNovosForaDaTela';
import { useOnline } from '../../hooks/useOnline';
import { assinarSaidas, dispensarSaida, lerSaidas } from '../../services/filaDeEnvio';
import { numeroDoPedido } from '../../lib/formatadores';

function textoDosGuardados(esperando, online) {
  if (esperando === 0) return null;
  const quantos = esperando === 1 ? '1 pedido guardado neste aparelho' : `${esperando} pedidos guardados neste aparelho`;
  const saem = esperando === 1 ? 'sai sozinho' : 'saem sozinhos';
  return online
    ? `${quantos}, esperando para sair. Não lance de novo.`
    : `${quantos}: ${saem} quando a internet voltar. Não lance de novo.`;
}

// Faixa fixa logo abaixo do cabeçalho, em qualquer tela: sem internet, ou com
// pedido guardado esperando para sair. Ela diz para não lançar de novo, que é
// o que gera pedido em dobro na cozinha.
export function FaixaDeInternet({ perfil }) {
  const online = useOnline();
  const topo = useFimDoCabecalho();
  const { pathname } = useLocation();
  const { fila } = useFilaDeEnvio({ negocioId: perfil?.negocio_id, usuarioId: perfil?.id });
  const esperando = perfil?.negocio_id ? fila.filter((e) => !e.erro).length : 0;
  const comErro = perfil?.negocio_id ? fila.length - esperando : 0;
  const guardados = textoDosGuardados(esperando, online);
  const foraDePedidos = pathname !== '/pedidos';

  if (online && !guardados && !(comErro && foraDePedidos)) return null;
  // Com internet, a tela de Pedidos já mostra a lista dos guardados.
  if (online && !foraDePedidos) return null;

  return (
    <div className="sticky z-10" style={{ top: topo }}>
      <p
        role={online ? 'status' : 'alert'}
        className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm font-bold ${
          online
            ? 'text-[var(--text-primary)] bg-[color-mix(in_srgb,var(--color-brand-orange)_30%,var(--surface))]'
            : 'text-[var(--sobre-destaque)] bg-[var(--color-accent-cozinha)]'
        }`}
      >
        {!online && <WifiOffIcon className="w-5 h-5 shrink-0" />}
        <span className="text-center">
          {!online && 'Sem internet. '}
          {guardados ??
            (comErro
              ? 'Um pedido guardado sem internet não entrou.'
              : 'Pedidos lançados aqui ficam guardados neste aparelho e saem sozinhos quando ela voltar.')}
        </span>
        {foraDePedidos && (guardados || comErro > 0) && (
          <Link to="/pedidos" className="underline underline-offset-2">
            Ver em Pedidos
          </Link>
        )}
        {!online && (
          <Link to="/ajuda#travou" className="underline underline-offset-2">
            Travou?
          </Link>
        )}
      </p>
    </div>
  );
}

function rotulo(saida) {
  const mesa = saida.mesa ? `${saida.nomeMesa || `Mesa ${saida.mesa}`}: ` : '';
  const nome = saida.identificacao ? `${saida.identificacao}: ` : '';
  return `${mesa}${nome}${saida.resumo}`;
}

// "Pedido de 1× X-burguer agora é o 014": o pedido guardado sem internet saiu
// e ganhou o número de verdade. Fica até tocar em "Ok". Na tela de Pedidos, o
// número aparece grande lá mesmo.
export function SaidasDaFila({ perfil }) {
  const negocioId = perfil?.negocio_id;
  const [saidas, setSaidas] = useState(() => (negocioId ? lerSaidas(negocioId) : []));

  useEffect(() => {
    if (!negocioId) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com o localStorage
    setSaidas(lerSaidas(negocioId));
    return assinarSaidas(() => setSaidas(lerSaidas(negocioId)));
  }, [negocioId]);

  if (!saidas.length) return null;

  return (
    <div role="region" aria-label="Pedidos que estavam esperando a internet" className="flex flex-col">
      {saidas.map((s) => (
        <div
          key={s.chaveEnvio}
          role="status"
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] bg-[color-mix(in_srgb,var(--color-accent-relatorios)_22%,var(--surface))]"
        >
          <span className="text-center break-words">
            Pedido de {rotulo(s)} saiu. {s.mesa ? 'Número' : 'Agora é o'}{' '}
            <strong className="text-lg tabular-nums" translate="no">
              {numeroDoPedido(s)}
            </strong>
            {s.mesa ? '.' : ': diga ao cliente.'}
          </span>
          <button
            type="button"
            onClick={() => dispensarSaida(negocioId, s.chaveEnvio)}
            className="min-h-11 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-alt)] px-4 font-bold"
          >
            Ok
          </button>
        </div>
      ))}
    </div>
  );
}
