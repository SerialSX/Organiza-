import Botao from '../ui/Botao';
import { WifiOffIcon } from '../icons/AppIcons';

// Pedidos guardados porque a internet caiu. Saem sozinhos quando ela volta;
// o atendente vê o que está esperando e pode forçar ou desistir.
export default function FilaDeEnvio({ fila, onTentar, onDescartar }) {
  if (!fila.length) return null;
  const esperando = fila.filter((e) => !e.erro);

  return (
    <section
      aria-labelledby="titulo-fila-envio"
      className="rounded-2xl border-2 bg-[var(--surface-card)] p-4 flex flex-col gap-3 mb-6"
      style={{ borderColor: 'var(--color-brand-orange)' }}
    >
      <div className="flex items-start gap-3">
        <WifiOffIcon className="w-6 h-6 shrink-0 text-[var(--texto-laranja)]" />
        <div className="flex-1 min-w-0">
          <h2 id="titulo-fila-envio" className="font-semibold text-[var(--text-primary)]">
            {esperando.length === 1
              ? '1 pedido esperando a internet'
              : esperando.length > 1
                ? `${esperando.length} pedidos esperando a internet`
                : 'Pedido que não entrou'}
          </h2>
          {esperando.length > 0 && (
            <p className="text-sm text-[var(--text-secondary)]">
              Saem sozinhos, na ordem, quando a conexão voltar. A senha aparece na hora.
            </p>
          )}
        </div>
        {esperando.length > 0 && (
          <Botao variante="secundaria" onClick={onTentar}>
            Tentar agora
          </Botao>
        )}
      </div>
      <ul className="flex flex-col gap-2" aria-live="polite">
        {fila.map((envio) => (
          <li key={envio.chaveEnvio} className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm">
            <p className="font-semibold text-[var(--text-primary)] break-words">
              {envio.mesa ? `Mesa ${envio.mesa}: ` : ''}
              {envio.identificacao ? `${envio.identificacao}: ` : ''}
              {envio.resumo}
            </p>
            {envio.erro && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--texto-cozinha)]">{envio.erro}</span>
                <Botao variante="texto" onClick={() => onDescartar(envio.chaveEnvio)}>
                  Descartar
                </Botao>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
