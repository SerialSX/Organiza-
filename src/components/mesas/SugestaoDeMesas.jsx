import { useEffect, useState } from 'react';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import { useAuth } from '../../context/useAuth';
import { noitesComMesaExtra } from '../../services/mesas';
import { sugestaoDeMesas } from '../../lib/mesas';

const DIAS_SEM_PERGUNTAR = 7;
const chave = (negocioId) => `organiza-sugestao-mesas-${negocioId}`;

// "Agora não" guarda a quantidade sugerida e o dia: a mesma sugestão só volta
// depois de uma semana (ou antes, se a sugestão crescer).
function dispensada(negocioId, quantidade) {
  try {
    const salvo = JSON.parse(localStorage.getItem(chave(negocioId)) ?? 'null');
    return Boolean(salvo) && salvo.quantidade >= quantidade && Date.now() - salvo.em < DIAS_SEM_PERGUNTAR * 86400000;
  } catch {
    return false;
  }
}

function dispensar(negocioId, quantidade) {
  try {
    localStorage.setItem(chave(negocioId), JSON.stringify({ quantidade, em: Date.now() }));
  } catch {
    // sem localStorage: a sugestão volta na próxima visita
  }
}

// Abriu mesa extra em 3 noites: sugere aumentar o número de mesas do mapa.
// Só o dono muda as mesas.
export default function SugestaoDeMesas() {
  const { perfil, configurarMesas } = useAuth();
  const [noites, setNoites] = useState([]);
  const [escondida, setEscondida] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState(null);
  const dono = perfil.papel === 'admin';

  useEffect(() => {
    if (!dono) return undefined;
    let ativo = true;
    noitesComMesaExtra()
      .then((n) => ativo && setNoites(n))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [dono]);

  const sugestao = sugestaoDeMesas(noites, perfil.quantidade_mesas);

  if (feito) {
    return (
      <div aria-live="polite" className="mb-4">
        <Aviso tipo="sucesso">Pronto: o mapa agora tem {feito} mesas. Dá para mudar em Minha conta.</Aviso>
      </div>
    );
  }
  if (!dono || !sugestao || escondida || dispensada(perfil.negocio_id, sugestao.quantidade)) return null;

  async function aumentar() {
    setSalvando(true);
    setErro('');
    const { erro: falha } = await configurarMesas({ quantidade: sugestao.quantidade, taxaServico: perfil.taxa_servico ?? 0 });
    setSalvando(false);
    if (falha) setErro(falha);
    else setFeito(sugestao.quantidade);
  }

  function agoraNao() {
    dispensar(perfil.negocio_id, sugestao.quantidade);
    setEscondida(true);
  }

  return (
    <section aria-labelledby="titulo-sugestao-mesas" className="mb-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 flex flex-col gap-3">
      <div>
        <h2 id="titulo-sugestao-mesas" className="font-semibold text-[var(--text-primary)]">
          Faltou mesa em {sugestao.noites} noites
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Você abriu mesa extra em {sugestao.noites} noites das últimas duas semanas. Quer que o mapa tenha {sugestao.quantidade} mesas em
          vez de {perfil.quantidade_mesas}?
        </p>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Botao cor="var(--color-brand-orange)" onClick={aumentar} disabled={salvando}>
          Sim, quero {sugestao.quantidade} mesas
        </Botao>
        <Botao variante="secundaria" onClick={agoraNao} disabled={salvando}>
          Agora não
        </Botao>
      </div>
    </section>
  );
}
