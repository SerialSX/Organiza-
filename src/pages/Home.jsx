import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import logo from '../assets/logo.svg';
import './Home.css';

const sections = [
  { key: 'produtos', label: 'Produtos', icon: '📦', route: '/produtos' },
  { key: 'pedidos', label: 'Pedidos', icon: '📋', route: '/pedidos' },
  { key: 'cozinha', label: 'Cozinha', icon: '🍳', route: '/cozinha' },
  { key: 'relatorios', label: 'Relatórios', icon: '📊', route: '/relatorios' },
];

export default function Home() {
  const { theme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="home-container" style={{ backgroundColor: theme.background }}>
      <header
        className="home-header"
        style={{
          background: `linear-gradient(90deg, ${theme.gradientStart}, ${theme.gradientEnd})`,
        }}
      >
        <img src={logo} alt="Organiza+" className="home-header-logo" />
        <p>Painel principal</p>
      </header>

      <div className="home-grid">
        {sections.map((section) => (
          <button
            key={section.key}
            className="home-card"
            style={{
              backgroundColor: theme.backgroundElement,
              borderColor: theme.inputBorder,
              color: theme.text,
            }}
            onClick={() => navigate(section.route)}
          >
            <span className="home-card-icon">{section.icon}</span>
            <span className="home-card-label">{section.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}