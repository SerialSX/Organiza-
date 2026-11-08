import Botao from '../ui/Botao';
import Etiqueta from '../ui/Etiqueta';
import { WifiOffIcon } from '../icons/AppIcons';
import { formatarHora, hojeNoNegocio } from '../../lib/formatadores';

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Fortaleza' });

// "Guardado às 21:40" ou, de outro dia, "Guardado em 06/11 às 23:50".
function quandoGuardou(guardadoEm) {
  if (!guardadoEm) return '';
  const data = new Date(guardadoEm);
  const hora = formatarHora(data);
  return hojeNoNegocio(data) === hojeNoNegocio() ? `Guardado às ${hora}` : `Guardado em ${dataCurta.format(data)} às ${hora}`;
}

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
              Saem sozinhos, na ordem, quando a conexão voltar, mesmo se fechar o Organiza+. A senha aparece na hora.{' '}
              <strong className="text-[var(--text-primary)]">Não lance de novo.</strong>
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
            {!envio.erro && (
              <Etiqueta cor="var(--color-brand-orange)" className="mb-1">
                Esperando internet
              </Etiqueta>
            )}
            <p className="font-semibold text-[var(--text-primary)] break-words">
              {envio.mesa ? `${envio.nomeMesa || `Mesa ${envio.mesa}`}: ` : ''}
              {envio.identificacao ? `${envio.identificacao}: ` : ''}
              {envio.resumo}
            </p>
            {envio.guardadoEm && <p className="text-xs tabular-nums text-[var(--text-secondary)]">{quandoGuardou(envio.guardadoEm)}</p>}
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
