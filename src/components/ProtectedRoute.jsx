import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import Carregando from './ui/Carregando';
import Aviso from './ui/Aviso';

function TelaDeAviso({ texto, acao, onAcao }) {
  return (
    <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center p-6">
      <div className="max-w-md w-full flex flex-col gap-4">
        <Aviso>{texto}</Aviso>
        <button
          type="button"
          onClick={onAcao}
          className="self-center text-sm font-semibold text-[var(--color-brand-orange)]"
        >
          {acao}
        </button>
      </div>
    </div>
  );
}

export default function ProtectedRoute() {
  const { carregando, semConexao, autenticado, perfil, sair } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="min-h-screen bg-[var(--surface)]">
        <Carregando />
      </div>
    );
  }

  if (!autenticado) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (!perfil && semConexao) {
    return (
      <TelaDeAviso
        texto="Sem conexão com o sistema. Confira a internet e tente de novo."
        acao="Tentar de novo"
        onAcao={() => window.location.reload()}
      />
    );
  }

  // Logado no Auth, mas sem linha em `usuarios`: o trigger de cadastro não rodou.
  if (!perfil) {
    return (
      <TelaDeAviso
        texto="Sua conta ainda não está ligada a um negócio. Avise a equipe do Organiza+ para concluir o cadastro."
        acao="Sair"
        onAcao={sair}
      />
    );
  }

  return <Outlet />;
}
