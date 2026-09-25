import { useEffect, useState } from 'react';
import { ThemeContext } from './themeContext';

const themes = {
  dark: {
    gradientStart: '#071322',
    gradientEnd: '#0A192F',
    background: '#0A192F',
    backgroundElement: 'rgba(255,255,255,0.06)',
    text: '#FFFFFF',
    textSecondary: '#B8B8B8',
    accent: '#EE9448',
    link: '#F2A46B',
    inputBorder: 'rgba(255,255,255,0.15)',
    card: '#0B1A30',       
  },
  light: {
    gradientStart: '#EE9448',
    gradientEnd: '#F2A46B',
    background: '#F7F7F8',
    backgroundElement: 'rgba(0,0,0,0.04)',
    text: '#1A1A1A',
    textSecondary: '#6B6B6B',
    accent: '#EE9448',
    link: '#C96A28',
    inputBorder: 'rgba(0,0,0,0.12)',
    card: '#FFFFFF',  
  },
};


function getInitialMode() {
  try {
    return localStorage.getItem('organiza-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(getInitialMode);
  const theme = themes[mode];

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
    root.dataset.theme = mode;
    try {
      localStorage.setItem('organiza-theme', mode);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue só em memória
    }
  }, [theme, mode]);

  function toggleTheme() {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  return (
    <ThemeContext.Provider value={{ mode, theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

