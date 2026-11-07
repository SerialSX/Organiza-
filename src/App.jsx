import { lazy as lazyDoReact, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeProvider';
import { AuthProvider } from './context/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import ExigeConfiguracao from './components/ExigeConfiguracao';
import Carregando from './components/ui/Carregando';
import ErroDaTela from './components/ErroDaTela';
import { ehArquivoDeVersaoAntiga, limparMarcaDeRecarga, recarregarUmaVez } from './lib/recarga';

// Cada tela vira um arquivo separado no build: quem abre a página do QR code
// não baixa a landing nem o painel. Se o arquivo sumiu num deploy, recarrega
// a página uma vez para pegar a versão nova.
function lazy(carregar) {
  return lazyDoReact(() =>
    carregar().catch((erro) => {
      if (ehArquivoDeVersaoAntiga(erro) && recarregarUmaVez()) return new Promise(() => {});
      throw erro;
    }),
  );
}

const Landing = lazy(() => import('./pages/Landing'));
const Ajuda = lazy(() => import('./pages/Ajuda'));
const Caixa = lazy(() => import('./pages/Caixa'));
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
  // Abriu bem: a próxima falha depois de um deploy pode recarregar de novo.
  useEffect(() => {
    const id = setTimeout(limparMarcaDeRecarga, 10000);
    return () => clearTimeout(id);
  }, []);

  return (
    <ErroDaTela>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<TelaCarregando />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/privacidade" element={<Privacidade />} />
                <Route path="/ajuda" element={<Ajuda />} />
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
                    <Route path="/caixa" element={<Caixa />} />
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
    </ErroDaTela>
  );
}

export default App;
