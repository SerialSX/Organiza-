import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useRecarregarAoVoltar } from './useRecarregarAoVoltar';
import { listarCombos, assinarCombos } from '../services/combos';
import { listarPromocoes } from '../services/promocoes';

// Combos e promoções do negócio, ao vivo (salvos em outro aparelho aparecem aqui).
// Banco sem a migração 2026-11-15: as duas listas ficam vazias.
export function useCombos() {
  const { perfil } = useAuth();
  const negocioId = perfil?.negocio_id;
  const [combos, setCombos] = useState([]);
  const [promocoes, setPromocoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const recarregar = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([listarCombos(), listarPromocoes()]);
      setCombos(c);
      setPromocoes(p);
      setErro('');
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!negocioId) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial vinda de fora do React
    recarregar();
    return assinarCombos(negocioId, recarregar);
  }, [negocioId, recarregar]);

  useRecarregarAoVoltar(recarregar);

  return { combos, promocoes, carregando, erro, recarregar };
}

// Hora atual que muda sozinha a cada 30 segundos: a promoção começa e acaba
// com a tela aberta.
export function useAgora(intervalo = 30000) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), intervalo);
    return () => clearInterval(id);
  }, [intervalo]);
  return agora;
}
