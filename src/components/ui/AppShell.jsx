import { Link, useLocation } from 'react-router-dom';
import AppNav from '../AppNav';
import RodapeContato from '../RodapeContato';
import { useAuth } from '../../context/useAuth';
import { useOnline } from '../../hooks/useOnline';
import { useBancoDesatualizado } from '../../hooks/useBancoDesatualizado';
import { useFilaDeEnvio } from '../../hooks/useFilaDeEnvio';
import { AlertIcon, WifiOffIcon } from '../icons/AppIcons';

// Pedido guardado sem internet sai sozinho em qualquer tela, não só em
// Pedidos. Fora de lá, um aviso mostra que ainda tem pedido esperando.
function PedidosGuardados({ perfil }) {
  const { pathname } = useLocation();
  const { fila } = useFilaDeEnvio({ negocioId: perfil.negocio_id, usuarioId: perfil.id });
  if (!fila.length || pathname === '/pedidos') return null;
  const esperando = fila.filter((e) => !e.erro).length;
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] bg-[color-mix(in_srgb,var(--color-brand-orange)_24%,transparent)]">
      <span>
        {esperando === 0
          ? 'Um pedido guardado sem internet não entrou.'
          : esperando === 1
            ? '1 pedido guardado sem internet, esperando para sair.'
            : `${esperando} pedidos guardados sem internet, esperando para sair.`}
      </span>
      <Link to="/pedidos" className="underline underline-offset-2">
        Ver em Pedidos
      </Link>
    </p>
  );
}

// reservaNoFim: espaço depois do rodapé para uma barra fixa da tela (ex.: o
// "Enviar" de Pedidos no celular) não cobrir o contato da equipe.
export default function AppShell({ children, largura = 'max-w-5xl', reservaNoFim = '' }) {
  const { modoDemo, perfil } = useAuth();
  const online = useOnline();
  const bancoAtrasado = useBancoDesatualizado();

  return (
    <div className="min-h-svh bg-[var(--surface)] pb-24 md:pb-0">
      <a
        href="#conteudo"
        className="sr-only-focusable fixed left-4 top-4 z-50 rounded-xl bg-[var(--surface-alt)] px-4 py-3 font-semibold text-[var(--text-primary)] shadow-lg"
      >
        Pular para o conteúdo
      </a>
      <AppNav />
      <div role="region" aria-label="Avisos do sistema" className="empty:hidden">
      {bancoAtrasado && (
        <p
          role="alert"
          className="flex items-start justify-center gap-2 px-4 py-2.5 text-sm font-bold text-[var(--sobre-destaque)] bg-[var(--color-accent-cozinha)]"
        >
          <AlertIcon className="w-5 h-5 shrink-0" />
          <span>
            O banco de dados do sistema está desatualizado: senhas e outras funções podem sair erradas. Avise quem cuida do
            Supabase para rodar os arquivos da pasta supabase/migracoes.
          </span>
        </p>
      )}
      {!online && (
        <p
          role="alert"
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-[var(--sobre-destaque)] bg-[var(--color-accent-cozinha)]"
        >
          <WifiOffIcon className="w-5 h-5 shrink-0" />
          Sem internet. Pedidos não estão sendo enviados nem recebidos.
        </p>
      )}
      {perfil?.negocio_id && <PedidosGuardados perfil={perfil} />}
      {modoDemo && (
        <p className="text-center text-xs font-medium px-4 py-2 text-[var(--text-primary)] bg-[color-mix(in_srgb,var(--color-brand-orange)_18%,transparent)]">
          Modo demonstração: os dados ficam salvos só neste navegador.
        </p>
      )}
      </div>
      <main id="conteudo" tabIndex={-1} className={`${largura} mx-auto px-4 sm:px-6 py-6 sm:py-10 outline-none`}>
        {children}
      </main>
      <footer className="border-t border-[var(--border-subtle)] px-4 py-6">
        <RodapeContato />
      </footer>
      {reservaNoFim && <div className={reservaNoFim} aria-hidden="true" />}
    </div>
  );
}
