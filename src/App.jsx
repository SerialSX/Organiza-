import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeProvider';
import { AuthProvider } from './context/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import ExigeConfiguracao from './components/ExigeConfiguracao';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import Home from './pages/Home';
import Produtos from './pages/Produtos';
import Pedidos from './pages/Pedidos';
import Cozinha from './pages/Cozinha';
import Relatorios from './pages/Relatorios';
import PaginaDoCliente from './pages/PaginaDoCliente';
import Acompanhar from './pages/Acompanhar';
import EsqueciSenha from './pages/EsqueciSenha';
import MinhaConta from './pages/MinhaConta';
import ExcluirConta from './pages/ExcluirConta';


function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route element={<ExigeConfiguracao />}>
              <Route path="/login" element={<Login />} />
              <Route path="/cadastro" element={<Cadastro />} />
              <Route path="/esqueci-senha" element={<EsqueciSenha />} />
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
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
