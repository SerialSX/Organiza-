import { useNavigate } from 'react-router-dom';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import { UserIcon, ProductsIcon, CheckIcon, QrIcon, TrashIcon } from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';

const ACCENT = 'var(--color-brand-orange)';
const PERIGO = 'var(--color-accent-cozinha)';

const PAPEIS = { admin: 'Dono do negócio', atendente: 'Atendente', cozinha: 'Cozinha' };

const caixa = 'rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 sm:p-8';

function suave(cor) {
  return `color-mix(in srgb, ${cor} 15%, transparent)`;
}

// "lucas silva" -> "LS"
function iniciais(nome) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

function Informacao({ icon: Icon, rotulo, valor }) {
  return (
    <div className="flex items-center gap-4 py-4">
      <span
        className="inline-flex items-center justify-center w-12 h-12 rounded-2xl shrink-0"
        style={{ color: ACCENT, backgroundColor: suave(ACCENT) }}
      >
        <Icon className="w-6 h-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-[var(--text-secondary)]">{rotulo}</p>
        <p className="text-lg font-semibold text-[var(--text-primary)] break-words">{valor}</p>
      </div>
    </div>
  );
}

export default function MinhaConta() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const papel = PAPEIS[perfil.papel] ?? perfil.papel;

  return (
    <AppShell largura="max-w-3xl">
      <PageHeader
        icon={UserIcon}
        accent={ACCENT}
        title="Minha conta"
        subtitle="Seus dados e as configurações da sua conta"
      />

      <div className="flex flex-col gap-6">
        {/* Perfil em destaque */}
        <section className={`${caixa} flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left`}>
          <span
            className="inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-bold text-white shrink-0 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${PERIGO})` }}
          >
            {iniciais(perfil.nome)}
          </span>
          <div className="min-w-0">
            <h2 className="text-3xl font-bold text-[var(--text-primary)] capitalize break-words">{perfil.nome}</h2>
            <p className="mt-1 text-lg text-[var(--text-secondary)] break-words">{perfil.negocio_nome}</p>
            <span
              className="mt-3 inline-block rounded-full px-4 py-1.5 text-sm font-semibold"
              style={{ color: ACCENT, backgroundColor: suave(ACCENT) }}
            >
              {papel}
            </span>
          </div>
        </section>

        {/* Dados da conta */}
        <section className={caixa}>
          <h3 className="text-xl font-bold text-[var(--text-primary)]">Dados da conta</h3>
          <div className="mt-2 divide-y divide-[var(--border-subtle)]">
            <Informacao icon={UserIcon} rotulo="Nome" valor={perfil.nome} />
            <Informacao icon={ProductsIcon} rotulo="Negócio" valor={perfil.negocio_nome} />
            <Informacao icon={CheckIcon} rotulo="Função" valor={papel} />
          </div>
        </section>

        {/* Atalho para a página do QR code (só o dono configura) */}
        {perfil.papel === 'admin' && (
          <button
            type="button"
            onClick={() => navigate('/pagina-do-cliente')}
            className={`${caixa} flex items-center gap-4 text-left hover:bg-[var(--surface-card-hover)] transition`}
          >
            <span
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl shrink-0"
              style={{ color: ACCENT, backgroundColor: suave(ACCENT) }}
            >
              <QrIcon className="w-6 h-6" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-lg font-semibold text-[var(--text-primary)]">Página do cliente</span>
              <span className="block text-sm text-[var(--text-secondary)]">
                QR code para seus clientes acompanharem o pedido
              </span>
            </span>
            <span className="text-2xl text-[var(--text-secondary)]" aria-hidden="true">›</span>
          </button>
        )}

        {/* Zona de perigo */}
        <section className={`${caixa} flex flex-col gap-4`} style={{ borderColor: `color-mix(in srgb, ${PERIGO} 40%, transparent)` }}>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl shrink-0"
              style={{ color: PERIGO, backgroundColor: suave(PERIGO) }}
            >
              <TrashIcon className="w-6 h-6" />
            </span>
            <h3 className="text-xl font-bold" style={{ color: PERIGO }}>Zona de perigo</h3>
          </div>
          <p className="text-base text-[var(--text-secondary)]">
            Excluir a conta apaga para sempre o seu negócio, os produtos, os pedidos e os relatórios. Não dá para desfazer.
          </p>
          <button
            type="button"
            onClick={() => navigate('/minha-conta/excluir')}
            className="self-start inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold border-2 border-[var(--color-accent-cozinha)] text-[var(--color-accent-cozinha)] transition hover:text-white hover:bg-[var(--color-accent-cozinha)]"
          >
            <TrashIcon className="w-5 h-5" />
            Excluir conta
          </button>
        </section>
      </div>
    </AppShell>
  );
}
