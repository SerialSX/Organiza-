import { createContext, useContext, useEffect, useState } from 'react';

const themes = {
  dark: {
    gradientStart: '#2D1B4E',
    gradientEnd: '#0F1B3C',
    background: '#0F1B3C',
    backgroundElement: 'rgba(255,255,255,0.08)',
    text: '#FFFFFF',
    textSecondary: '#C9C3DE',
    accent: '#7C5CFF',
    link: '#B39DFF',
    inputBorder: 'rgba(255,255,255,0.15)',
  },
  light: {
    gradientStart: '#FF8C42',
    gradientEnd: '#FFB49A',
    background: '#F7F7F8',
    backgroundElement: 'rgba(0,0,0,0.04)',
    text: '#1A1A1A',
    textSecondary: '#6B6B6B',
    accent: '#FF8C42',
    link: '#D9661F',
    inputBorder: 'rgba(0,0,0,0.12)',
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('dark');
  const theme = themes[mode];

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
  }, [theme]);

  function toggleTheme() {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  return (
    <ThemeContext.Provider value={{ mode, theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}