import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import Home from './pages/Home';
import Produtos from './pages/Produtos';
import Pedidos from './pages/Pedidos';
import Cozinha from './pages/Cozinha';
import Relatorios from './pages/Relatorios';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/home" element={<Home />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/cozinha" element={<Cozinha />} />
          <Route path="/relatorios" element={<Relatorios />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;