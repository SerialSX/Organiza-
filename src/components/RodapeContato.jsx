import { Link } from 'react-router-dom';
import { EMAIL_CONTATO, GRUPO_WHATSAPP } from '../lib/contato';
import { HelpIcon, MailIcon } from './icons/AppIcons';

const link = 'inline-flex items-center gap-1.5 font-semibold text-[var(--texto-laranja)] underline underline-offset-4';

// Contato da equipe: rodapé da landing, das telas de acesso e do painel.
// dentroDoSistema (quem já usa): o "Travou? Veja o que fazer", o grupo do
// WhatsApp (se configurado) e o e-mail. Nas páginas públicas, só o e-mail.
export default function RodapeContato({ className = '', dentroDoSistema = false }) {
  if (dentroDoSistema) {
    return (
      <div className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center text-sm text-[var(--text-secondary)] ${className}`}>
        <Link to="/ajuda#travou" className={link}>
          <HelpIcon className="w-4 h-4 shrink-0" />
          Travou? Veja o que fazer
        </Link>
        {GRUPO_WHATSAPP && (
          <a href={GRUPO_WHATSAPP} target="_blank" rel="noreferrer" className={link}>
            Grupo de ajuda (WhatsApp)
          </a>
        )}
        <a href={`mailto:${EMAIL_CONTATO}`} className={`${link} break-all`}>
          <MailIcon className="w-4 h-4 shrink-0" />
          {EMAIL_CONTATO}
        </a>
      </div>
    );
  }
  return (
    <p className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-[var(--text-secondary)] ${className}`}>
      <span>Precisa de ajuda ou quer mais informações? Fale com a gente:</span>
      <a href={`mailto:${EMAIL_CONTATO}`} className={`${link} break-all`}>
        <MailIcon className="w-4 h-4 shrink-0" />
        {EMAIL_CONTATO}
      </a>
    </p>
  );
}
