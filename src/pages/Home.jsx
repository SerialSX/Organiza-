import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './Home.css';

const sections = [
  { key: 'cardapio', label: 'Cardápio', icon: '🍽️', route: '/cardapio' },
  { key: 'pedidos', label: 'Pedidos', icon: '📋', route: '/pedidos' },
  { key: 'estoque', label: 'Estoque', icon: '📦', route: '/estoque' },
  { key: 'financeiro', label: 'Financeiro', icon: '💰', route: '/financeiro' },
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
        <h1>Organiza+</h1>
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