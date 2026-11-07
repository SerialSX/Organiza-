import { Component } from 'react';
import { ehArquivoDeVersaoAntiga, recarregarUmaVez } from '../lib/recarga';

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
    return (
      <div className="min-h-svh bg-[var(--surface)] flex items-center justify-center px-5">
        <div role="alert" className="max-w-md text-center flex flex-col items-center gap-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Algo deu errado nesta tela</h1>
          <p className="text-[var(--text-secondary)]">
            Seus pedidos estão salvos. Recarregue a página para continuar. Se acontecer de novo, fale com a equipe pela
            página de Ajuda.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-12 rounded-xl px-6 font-bold text-[var(--sobre-destaque)]"
            style={{ backgroundColor: 'var(--color-brand-orange)' }}
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
