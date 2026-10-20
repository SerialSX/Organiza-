import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeProvider';
import { AuthProvider } from './context/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import ExigeConfiguracao from './components/ExigeConfiguracao';
import Carregando from './components/ui/Carregando';
import Landing from './pages/Landing';

// Cada tela vira um arquivo separado no build: quem abre a landing ou a página
// do QR code não baixa o código do painel inteiro.
const Login = lazy(() => import('./pages/Login'));
const Cadastro = lazy(() => import('./pages/Cadastro'));
const EsqueciSenha = lazy(() => import('./pages/EsqueciSenha'));
const RedefinirSenha = lazy(() => import('./pages/RedefinirSenha'));
const Privacidade = lazy(() => import('./pages/Privacidade'));
const Acompanhar = lazy(() => import('./pages/Acompanhar'));
const Home = lazy(() => import('./pages/Home'));
const Produtos = lazy(() => import('./pages/Produtos'));
const Pedidos = lazy(() => import('./pages/Pedidos'));
const Cozinha = lazy(() => import('./pages/Cozinha'));
const Relatorios = lazy(() => import('./pages/Relatorios'));
const PaginaDoCliente = lazy(() => import('./pages/PaginaDoCliente'));
const MinhaConta = lazy(() => import('./pages/MinhaConta'));
const ExcluirConta = lazy(() => import('./pages/ExcluirConta'));

function TelaCarregando() {
  return (
    <div className="min-h-svh bg-[var(--surface)]">
      <Carregando />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<TelaCarregando />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/privacidade" element={<Privacidade />} />
              <Route element={<ExigeConfiguracao />}>
                <Route path="/login" element={<Login />} />
                <Route path="/cadastro" element={<Cadastro />} />
                <Route path="/esqueci-senha" element={<EsqueciSenha />} />
                <Route path="/redefinir-senha" element={<RedefinirSenha />} />
                {/* Página pública do QR code: sem login */}
                <Route path="/p/:codigo" element={<Acompanhar />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/home" element={<Home />} />
                  <Route path="/produtos" element={<Produtos />} />
                  <Route path="/pedidos" element={<Pedidos />} />
                  <Route path="/cozinha" element={<Cozinha />} />
                  <Route path="/relatorios" element={<Relatorios />} />
                  <Route path="/pagina-do-cliente" element={<PaginaDoCliente />} />
                  <Route path="/minha-conta" element={<MinhaConta />} />
                  <Route path="/minha-conta/excluir" element={<ExcluirConta />} />
                  <Route path="/conta" element={<Navigate to="/minha-conta" replace />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
