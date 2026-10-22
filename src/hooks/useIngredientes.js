import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { useRecarregarAoVoltar } from './useRecarregarAoVoltar';
import { listarIngredientes } from '../services/ingredientes';
import { assinarDemo } from '../services/demoStore';

// Ingredientes mudam pouco e só o dono mexe: carrega ao abrir, ao voltar para
// a aba do navegador e depois de cada mudança feita nesta tela.
export function useIngredientes() {
  const [ingredientes, setIngredientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const recarregar = useCallback(async () => {
    try {
      setIngredientes(await listarIngredientes());
      setErro('');
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial vinda de fora do React
    recarregar();
    return isSupabaseConfigured ? undefined : assinarDemo(recarregar);
  }, [recarregar]);

  useRecarregarAoVoltar(recarregar);

  return { ingredientes, carregando, erro, recarregar };
}
