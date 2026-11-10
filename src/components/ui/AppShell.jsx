import AppNav from '../AppNav';
import RodapeContato from '../RodapeContato';
import { useAuth } from '../../context/useAuth';
import { useBancoDesatualizado } from '../../hooks/useBancoDesatualizado';
import { FaixaDeInternet, SaidasDaFila } from './AvisosDeInternet';
import { AlertIcon } from '../icons/AppIcons';

// Pedido guardado sem internet sai sozinho em qualquer tela, não só em
// Pedidos: a faixa de internet e o aviso "agora é o 014" ficam em todas.

// reservaNoFim: espaço depois do rodapé para uma barra fixa da tela (ex.: o
// "Enviar" de Pedidos no celular) não cobrir o contato da equipe.
export default function AppShell({ children, largura = 'max-w-5xl', reservaNoFim = '' }) {
  const { modoDemo, perfil } = useAuth();
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
      <FaixaDeInternet perfil={perfil} />
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
      <SaidasDaFila perfil={perfil} />
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
        <RodapeContato dentroDoSistema />
      </footer>
      {reservaNoFim && <div className={reservaNoFim} aria-hidden="true" />}
    </div>
  );
}
