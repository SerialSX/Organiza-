import { useEffect, useRef } from 'react';

// Janela por cima da tela (dialog nativo): o foco fica dentro dela, Esc fecha
// e o leitor de tela anuncia o título.
export default function Janela({ titulo, idTitulo, onFechar, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (dialogo && !dialogo.open) dialogo.showModal?.();
    return () => dialogo?.open && dialogo.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        onFechar();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-0 text-[var(--text-primary)] shadow-2xl backdrop:bg-black/60"
    >
      {/* No tema escuro o cartão é translúcido: o fundo opaco fica no dialog. */}
      <div className="flex flex-col gap-4 p-5 sm:p-6 bg-[var(--surface-card)] min-h-full">
        <div className="flex items-start justify-between gap-3">
          <h2 id={idTitulo} className="text-2xl font-extrabold text-[var(--text-primary)] break-words min-w-0">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar a janela"
            className="w-11 h-11 shrink-0 rounded-xl border border-[var(--border-subtle)] text-xl text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)]"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
