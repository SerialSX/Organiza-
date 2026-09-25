import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import Carregando from './ui/Carregando';
import Aviso from './ui/Aviso';

export default function ProtectedRoute() {
  const { carregando, autenticado, perfil, sair } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="min-h-screen bg-[var(--surface)]">
        <Carregando />
      </div>
    );
  }

  if (!autenticado) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  // Logado no Auth, mas sem linha em `usuarios`: o trigger de cadastro não rodou.
  if (!perfil) {
    return (
      <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center p-6">
        <div className="max-w-md w-full flex flex-col gap-4">
          <Aviso>
            Sua conta ainda não está ligada a um negócio. Avise a equipe do Organiza+ para concluir o cadastro.
          </Aviso>
          <button
            type="button"
            onClick={sair}
            className="self-center text-sm font-semibold text-[var(--color-brand-orange)]"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
