import { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import AppShell from './ui/AppShell';
import { ehArquivoDeVersaoAntiga, recarregarUmaVez, semInternet } from '../lib/recarga';

const LINK = 'min-h-12 inline-flex items-center rounded-xl px-4 font-semibold underline underline-offset-2 text-[var(--text-primary)]';

// Qualquer erro numa tela vira um aviso com "Recarregar", em vez de a tela
// ficar em branco no meio do expediente.
export default class ErroDaTela extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro) {
    if (ehArquivoDeVersaoAntiga(erro)) recarregarUmaVez();
  }

  render() {
    if (!this.state.erro) return this.props.children;
    const offline = semInternet() && ehArquivoDeVersaoAntiga(this.state.erro);
    const Moldura = this.props.comMenu ? AppShell : Fragment;
    return (
      <Moldura>
      <div className="min-h-svh bg-[var(--surface)] flex items-center justify-center px-5">
        <div role="alert" className="max-w-md text-center flex flex-col items-center gap-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {offline ? 'Sem internet para abrir esta tela' : 'Algo deu errado nesta tela'}
          </h1>
          <p className="text-[var(--text-secondary)]">
            {offline
              ? 'Os pedidos guardados continuam neste aparelho. Volte para Pedidos para continuar atendendo.'
              : 'Seus pedidos estão salvos. Recarregue a página para continuar. Se acontecer de novo, fale com a equipe pela página de Ajuda.'}
          </p>
          {!offline && <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-12 rounded-xl px-6 font-bold text-[var(--sobre-destaque)]"
            style={{ backgroundColor: 'var(--color-brand-orange)' }}
          >
            Recarregar
          </button>}
          <nav aria-label="Outras telas" className="flex flex-wrap justify-center gap-2">
            <Link to="/pedidos" className={LINK}>Voltar para Pedidos</Link>
            <Link to="/home" className={LINK}>
              Ir para o início
            </Link>
            <Link to="/ajuda" className={LINK}>
              Ajuda
            </Link>
          </nav>
        </div>
      </div>
      </Moldura>
    );
  }
}
