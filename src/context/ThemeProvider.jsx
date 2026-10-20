import { useEffect, useMemo, useState } from 'react';
import { ThemeContext } from './themeContext';

const CHAVE = 'organiza-theme';
// Mesma cor de --surface-alt / --surface em index.css: a barra do navegador no
// celular acompanha o tema.
const COR_DA_BARRA = { dark: '#071322', light: '#F7F5F2' };

function getInitialMode() {
  try {
    return localStorage.getItem(CHAVE) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(getInitialMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_DA_BARRA[mode]);
    try {
      localStorage.setItem(CHAVE, mode);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue só em memória
    }
  }, [mode]);

  const valor = useMemo(
    () => ({ mode, toggleTheme: () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark')) }),
    [mode],
  );

  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}
