import { EMAIL_CONTATO } from '../lib/contato';
import { MailIcon } from './icons/AppIcons';

// Contato da equipe para quem precisar de ajuda: rodapé da landing, das telas
// de acesso e do painel.
export default function RodapeContato({ className = '' }) {
  return (
    <p className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-[var(--text-secondary)] ${className}`}>
      <span>Precisa de ajuda ou quer mais informações? Fale com a gente:</span>
      <a
        href={`mailto:${EMAIL_CONTATO}`}
        className="inline-flex items-center gap-1.5 font-semibold text-[var(--texto-laranja)] underline underline-offset-4 break-all"
      >
        <MailIcon className="w-4 h-4 shrink-0" />
        {EMAIL_CONTATO}
      </a>
    </p>
  );
}
