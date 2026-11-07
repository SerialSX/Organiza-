import { lazy, Suspense, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { precisaResponderBoasVindas } from '../lib/atendimento';
import Carregando from './ui/Carregando';
import Aviso from './ui/Aviso';

// Só quem ainda não respondeu baixa as telas de boas-vindas.
const BoasVindas = lazy(() => import('./boasVindas/BoasVindas'));

// Enquanto o dono não responder as perguntas, nenhuma tela do painel abre
// (nem pelo endereço). Depois de salvar, o passo a passo da cozinha ainda
// aparece até ele tocar em "Começar"/"Faço isso depois".
function PortaoBoasVindas({ perfil }) {
  const [respondendo, setRespondendo] = useState(() => precisaResponderBoasVindas(perfil));
  if (!respondendo) return <Outlet />;
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--surface)]">
          <Carregando />
        </div>
      }
    >
      <BoasVindas onConcluir={() => setRespondendo(false)} />
    </Suspense>
  );
}

function TelaDeAviso({ texto, acao, onAcao }) {
  return (
    <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center p-6">
      <div className="max-w-md w-full flex flex-col gap-4">
        <Aviso>{texto}</Aviso>
        <button
          type="button"
          onClick={onAcao}
          className="self-center text-sm font-semibold text-[var(--texto-laranja)]"
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

  // key: outra conta neste aparelho começa o portão do zero.
  return <PortaoBoasVindas key={perfil.id} perfil={perfil} />;
}
