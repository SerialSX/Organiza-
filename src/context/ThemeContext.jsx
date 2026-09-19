import { createContext, useContext, useEffect, useState } from 'react';

const themes = {
  dark: {
    gradientStart: '#242424',
    gradientEnd: '#2D2D2D',
    background: '#2D2D2D',
    backgroundElement: 'rgba(255,255,255,0.06)',
    text: '#FFFFFF',
    textSecondary: '#B8B8B8',
    accent: '#E8823C',
    link: '#F2A46B',
    inputBorder: 'rgba(255,255,255,0.15)',
  },
  light: {
    gradientStart: '#E8823C',
    gradientEnd: '#F2A46B',
    background: '#F7F7F8',
    backgroundElement: 'rgba(0,0,0,0.04)',
    text: '#1A1A1A',
    textSecondary: '#6B6B6B',
    accent: '#E8823C',
    link: '#C96A28',
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