import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import AppShell from '../components/ui/AppShell';
import PageHeader from '../components/ui/PageHeader';
import Aviso from '../components/ui/Aviso';
import Carregando from '../components/ui/Carregando';
import { QrIcon, PrinterIcon, CopyIcon } from '../components/icons/AppIcons';
import { useAuth } from '../context/useAuth';
import {
  buscarConfiguracaoPagina,
  enderecoDaPagina,
  salvarConfiguracaoPagina,
  trocarCodigoPagina,
} from '../services/paginaPublica';

const ACCENT = 'var(--color-brand-orange)';

const caixa = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 sm:p-6 flex flex-col gap-4';
const botaoSecundario =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)]';

// Folha impressa: só aparece na impressão (ver .cartaz em index.css).
function Cartaz({ nome, qr }) {
  return (
    <div className="cartaz" aria-hidden="true">
      <p className="cartaz-nome">{nome}</p>
      <p className="cartaz-titulo">Acompanhe seu pedido</p>
      {qr && <img src={qr} alt="" className="cartaz-qr" />}
      <ol className="cartaz-passos">
        <li>Aponte a câmera do celular para o código.</li>
        <li>Digite o número do seu pedido.</li>
        <li>A tela avisa quando ficar pronto.</li>
      </ol>
    </div>
  );
}

export default function PaginaDoCliente() {
  const { modoDemo } = useAuth();
  const [config, setConfig] = useState(null);
  const [nome, setNome] = useState('');
  const [qr, setQr] = useState('');
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [confirmandoTroca, setConfirmandoTroca] = useState(false);

  useEffect(() => {
    let ativo = true;
    buscarConfiguracaoPagina()
      .then((c) => {
        if (!ativo) return;
        setConfig(c);
        setNome(c.nomePublico);
      })
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  const endereco = config ? enderecoDaPagina(config.codigo) : '';

  useEffect(() => {
    if (!endereco) return;
    QRCode.toDataURL(endereco, { width: 640, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setErro('Não foi possível gerar o QR code.'));
  }, [endereco]);

  async function salvar(alteracoes) {
    setErro('');
    setMensagem('');
    setSalvando(true);
    const novo = { nomePublico: nome, ativa: config.ativa, ...alteracoes };
    try {
      await salvarConfiguracaoPagina(novo);
      setConfig((c) => ({ ...c, nomePublico: novo.nomePublico.trim(), ativa: novo.ativa }));
      setMensagem('Salvo.');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function trocarEndereco() {
    setErro('');
    setMensagem('');
    try {
      const codigo = await trocarCodigoPagina();
      setConfig((c) => ({ ...c, codigo }));
      setConfirmandoTroca(false);
      setMensagem('Endereço trocado. Imprima o cartaz novo e tire os antigos.');
    } catch (e) {
      setErro(e.message);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(endereco);
      setMensagem('Endereço copiado.');
    } catch {
      setErro('Não foi possível copiar. Selecione o endereço e copie.');
    }
  }

  if (!config) {
    return (
      <AppShell largura="max-w-3xl">
        {erro ? <Aviso>{erro}</Aviso> : <Carregando />}
      </AppShell>
    );
  }

  const nomeNaPagina = config.nomePublico || config.nomeCadastro;

  return (
    <AppShell largura="max-w-3xl">
      <div className="nao-imprimir">
        <PageHeader
          icon={QrIcon}
          accent={ACCENT}
          title="Página do cliente"
          subtitle="O cliente lê o QR code e acompanha o pedido, sem cadastro"
        />

        <div className="flex flex-col gap-5">
          {erro && <Aviso>{erro}</Aviso>}
          {mensagem && <Aviso tipo="sucesso">{mensagem}</Aviso>}
          {modoDemo && (
            <Aviso>No modo demonstração a página só funciona neste navegador.</Aviso>
          )}
          {!config.ativa && <Aviso>A página está desligada. Quem ler o QR vê "Página não encontrada".</Aviso>}

          <section className={caixa}>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Nome que aparece para o cliente</h2>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value.slice(0, 60))}
              maxLength={60}
              placeholder={config.nomeCadastro}
              aria-label="Nome que aparece para o cliente"
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-primary)] px-4 py-3 text-base outline-none focus:border-[var(--color-brand-orange)]"
            />
            <p className="text-xs text-[var(--text-secondary)] -mt-2">Deixe em branco para usar o nome do cadastro.</p>
            <button
              type="button"
              onClick={() => salvar({})}
              disabled={salvando || nome.trim() === config.nomePublico}
              className="self-start rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              {salvando ? 'Salvando...' : 'Salvar nome'}
            </button>
          </section>

          <section className={caixa}>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">QR code</h2>
            <div className="flex flex-col sm:flex-row gap-5 items-center">
              {qr && (
                <img src={qr} alt={`QR code da página de ${nomeNaPagina}`} className="w-48 h-48 rounded-xl bg-white p-2" />
              )}
              <div className="flex flex-col gap-3 w-full min-w-0">
                <p className="text-sm text-[var(--text-secondary)] break-all">{endereco}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => window.print()} className={botaoSecundario}>
                    <PrinterIcon className="w-5 h-5" />
                    Imprimir cartaz
                  </button>
                  <button type="button" onClick={copiar} className={botaoSecundario}>
                    <CopyIcon className="w-5 h-5" />
                    Copiar endereço
                  </button>
                  <a href={endereco} target="_blank" rel="noreferrer" className={botaoSecundario}>
                    Ver como o cliente vê
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section className={caixa}>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Controle</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => salvar({ nomePublico: config.nomePublico, ativa: !config.ativa })}
                disabled={salvando}
                className={botaoSecundario}
              >
                {config.ativa ? 'Desligar a página' : 'Ligar a página'}
              </button>
              {!confirmandoTroca && (
                <button type="button" onClick={() => setConfirmandoTroca(true)} className={botaoSecundario}>
                  Trocar endereço
                </button>
              )}
            </div>
            {confirmandoTroca && (
              <div className="flex flex-col gap-3">
                <Aviso>
                  Use se alguém estiver usando o QR de má-fé. O endereço atual para de funcionar e os cartazes impressos
                  precisam ser trocados.
                </Aviso>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={trocarEndereco}
                    className="rounded-xl px-4 py-3 text-sm font-semibold text-white bg-[var(--color-accent-cozinha)]"
                  >
                    Trocar mesmo assim
                  </button>
                  <button type="button" onClick={() => setConfirmandoTroca(false)} className={botaoSecundario}>
                    Voltar
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <Cartaz nome={nomeNaPagina} qr={qr} />
    </AppShell>
  );
}
