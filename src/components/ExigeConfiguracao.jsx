import { Outlet } from 'react-router-dom';
import { configuracaoAusente } from '../lib/supabaseClient';
import Aviso from './ui/Aviso';

export default function ExigeConfiguracao() {
  if (!configuracaoAusente) return <Outlet />;

  return (
    <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <Aviso>O sistema está fora do ar no momento. Tente de novo mais tarde.</Aviso>
      </div>
    </div>
  );
}
