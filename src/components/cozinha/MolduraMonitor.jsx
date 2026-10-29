import { useEffect, useState } from 'react';
import Botao from '../ui/Botao';
import { CloseIcon, FullscreenIcon, KitchenIcon, WifiOffIcon } from '../icons/AppIcons';
import { useOnline } from '../../hooks/useOnline';

const ACCENT = 'var(--color-accent-cozinha)';

function useTelaCheia() {
  const [ativa, setAtiva] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const aoMudar = () => setAtiva(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', aoMudar);
    return () => {
      document.removeEventListener('fullscreenchange', aoMudar);
      // Saindo do modo monitor, sai da tela cheia junto.
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  function alternar() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  return { suportada: Boolean(document.fullscreenEnabled), ativa, alternar };
}

// Modo monitor da Cozinha: a fila numa TV ou tablet só da cozinha. Sem o menu
// do sistema, com fundo preto e texto branco em qualquer tema (.tema-monitor)
// e só o que importa para preparar.
export default function MolduraMonitor({ naFila, atrasados, children }) {
  const online = useOnline();
  const telaCheia = useTelaCheia();

  return (
    <div className="tema-monitor min-h-svh bg-[var(--surface)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-6 gap-y-3 border-b-2 border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <h1 className="flex items-center gap-3 text-2xl font-extrabold">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: ACCENT }}>
            <KitchenIcon className="h-6 w-6 text-[var(--sobre-destaque)]" />
          </span>
          Cozinha
        </h1>
        <p className="flex flex-wrap gap-x-4 text-xl font-bold tabular-nums">
          <span>{naFila} na fila</span>
          <span style={{ color: atrasados ? 'var(--texto-cozinha)' : 'var(--text-secondary)' }}>
            {atrasados} {atrasados === 1 ? 'atrasado' : 'atrasados'}
          </span>
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {telaCheia.suportada && (
            <Botao variante="secundaria" onClick={telaCheia.alternar}>
              <FullscreenIcon className="h-5 w-5" />
              {telaCheia.ativa ? 'Sair da tela cheia' : 'Tela cheia'}
            </Botao>
          )}
          <Botao variante="secundaria" para="/cozinha">
            <CloseIcon className="h-5 w-5" />
            Sair do modo monitor
          </Botao>
        </div>
      </header>

      {!online && (
        <p
          role="alert"
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-base font-bold text-[var(--sobre-destaque)] bg-[var(--color-accent-cozinha)]"
        >
          <WifiOffIcon className="h-5 w-5 shrink-0" />
          Sem internet. Pedidos não estão sendo enviados nem recebidos.
        </p>
      )}

      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}
