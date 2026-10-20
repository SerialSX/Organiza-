import { useSearchParams } from 'react-router-dom';

// Aba guardada no endereço (?aba=esgotados): recarregar a página ou mandar o
// link mantém a mesma aba aberta.
export function useAbaNoEndereco(parametro, opcoes, padrao) {
  const [busca, setBusca] = useSearchParams();
  const atual = busca.get(parametro);
  const valor = opcoes.some((o) => o.id === atual) ? atual : padrao;

  function mudar(id) {
    const nova = new URLSearchParams(busca);
    if (id === padrao) nova.delete(parametro);
    else nova.set(parametro, id);
    setBusca(nova, { replace: true });
  }

  return [valor, mudar];
}
