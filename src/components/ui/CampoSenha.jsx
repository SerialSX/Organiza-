import { useId, useState } from 'react';
import { EyeIcon, EyeOffIcon } from '../icons/AppIcons';
import { classeCampo } from './Campo';

export default function CampoSenha({ rotulo = 'Senha', dica, erro, id, ...props }) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const [visivel, setVisivel] = useState(false);
  const idDica = dica ? `${idCampo}-dica` : undefined;
  const idErro = erro ? `${idCampo}-erro` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={idCampo} className="text-sm font-medium text-[var(--text-secondary)]">
        {rotulo}
      </label>
      <div className="relative">
        <input
          id={idCampo}
          type={visivel ? 'text' : 'password'}
          className={`${classeCampo} pr-24`}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={erro ? true : undefined}
          aria-describedby={[idDica, idErro].filter(Boolean).join(' ') || undefined}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-pressed={visivel}
          className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 min-h-10 rounded-lg px-3 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {visivel ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
          {visivel ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {dica && (
        <p id={idDica} className="text-xs text-[var(--text-secondary)]">
          {dica}
        </p>
      )}
      {erro && (
        <p id={idErro} className="text-sm font-medium text-[var(--texto-cozinha)]">
          {erro}
        </p>
      )}
    </div>
  );
}
