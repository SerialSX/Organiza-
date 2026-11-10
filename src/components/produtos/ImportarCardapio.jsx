import { useRef, useState } from 'react';
import Aviso from '../ui/Aviso';
import Botao from '../ui/Botao';
import Campo from '../ui/Campo';
import Carregando from '../ui/Carregando';
import Etiqueta from '../ui/Etiqueta';
import { CameraIcon, CloseIcon } from '../icons/AppIcons';
import { lerCardapio } from '../../services/cardapio';
import { criarProduto } from '../../services/produtos';
import { lerValor, valorParaCampo } from '../../lib/formatadores';

const ACCENT = 'var(--color-accent-produtos)';
const LADO_MAXIMO = 1600;

// LGPD: no plano grátis o Google pode guardar e usar a foto. A página de
// privacidade diz o mesmo.
const AVISO_FOTO =
  'A foto é enviada ao serviço de inteligência artificial do Google (Gemini) só para identificar nomes e preços. ' +
  'O Organiza+ não guarda a foto, mas o Google pode guardá-la, lê-la e usá-la para melhorar os serviços dele, inclusive fora do Brasil. ' +
  'Fotografe só o cardápio, sem pessoas, documentos ou dados de clientes, e confira os itens antes de salvar.';

// Redesenha a foto menor e em JPEG: envio rápido no 4G e sem os metadados
// (EXIF, GPS) que a câmera grava.
async function reduzirFoto(arquivo) {
  const imagem = await createImageBitmap(arquivo).catch(() => null);
  if (!imagem) throw new Error('Não deu para abrir essa foto. Escolha outra.');
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);
  canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
  imagem.close();
  const foto = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!foto) throw new Error('Não deu para preparar a foto. Tente de novo.');
  return foto;
}

const chave = (nome) => nome.trim().toLowerCase();

// O que já existe no cardápio e o que veio sem preço começam desmarcados.
function prepararItens(lidos, produtos) {
  const existentes = new Set(produtos.map((p) => chave(p.nome)));
  return lidos.map((item, indice) => ({
    id: String(indice),
    nome: item.nome,
    preco: valorParaCampo(item.preco),
    semPreco: item.preco === null,
    jaCadastrado: existentes.has(chave(item.nome)),
    selecionado: item.preco !== null && !existentes.has(chave(item.nome)),
  }));
}

export default function ImportarCardapio({ produtos, negocioId, onFechar, onImportado }) {
  // foto: esperando a foto; lendo: IA trabalhando; conferir: lista editável; salvando
  const [etapa, setEtapa] = useState('foto');
  const [itens, setItens] = useState([]);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState('');
  const entrada = useRef(null);
  const marcados = itens.filter((i) => i.selecionado);

  async function aoEscolherFoto(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro('');
    setEtapa('lendo');
    try {
      setItens(prepararItens(await lerCardapio(await reduzirFoto(arquivo)), produtos));
      setErros({});
      setEtapa('conferir');
    } catch (falha) {
      setErro(falha.message);
      setEtapa('foto');
    }
  }

  function alterar(id, campo, valor) {
    setItens((lista) => lista.map((i) => (i.id === id ? { ...i, [campo]: valor } : i)));
  }

  function lerOutra() {
    setItens([]);
    setErros({});
    setErro('');
    setEtapa('foto');
  }

  async function salvar(e) {
    e.preventDefault();
    // Mesmas regras do formulário de produto.
    const invalidos = {};
    for (const item of marcados) {
      const erroItem = {};
      if (!item.nome.trim()) erroItem.nome = 'Digite o nome do produto.';
      if (!(lerValor(item.preco) > 0)) erroItem.preco = 'Digite um preço maior que zero, como 12,50.';
      if (erroItem.nome || erroItem.preco) invalidos[item.id] = erroItem;
    }
    setErros(invalidos);
    const [primeiro] = Object.entries(invalidos);
    if (primeiro) {
      e.currentTarget.elements.namedItem(`${primeiro[1].nome ? 'nome' : 'preco'}-${primeiro[0]}`)?.focus();
      return;
    }

    setErro('');
    setEtapa('salvando');
    const salvos = new Set();
    try {
      for (const item of marcados) {
        await criarProduto(negocioId, { nome: item.nome.trim(), preco: Math.round(lerValor(item.preco) * 100) / 100, custo: null });
        salvos.add(item.id);
      }
    } catch (falha) {
      // O que já entrou sai da lista; o resto continua marcado para tentar de novo.
      setItens((lista) => lista.filter((i) => !salvos.has(i.id)));
      setErro(`${falha.message} ${salvos.size} de ${marcados.length} já foram salvos.`);
      setEtapa('conferir');
      return;
    }
    onImportado(salvos.size);
  }

  return (
    <section className="rounded-2xl border-2 bg-[var(--surface-card)] p-5 sm:p-6 mb-6 flex flex-col gap-4" style={{ borderColor: ACCENT }}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-importar-cardapio" className="text-lg font-semibold text-[var(--text-primary)]">
          Importar do cardápio
        </h2>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar sem importar"
          className="w-11 h-11 inline-flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-card-hover)]"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {erro && <Aviso>{erro}</Aviso>}

      {etapa === 'foto' && (
        <>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{AVISO_FOTO}</p>
          {/* Sem capture: o celular oferece câmera ou galeria. */}
          <input ref={entrada} type="file" accept="image/*" onChange={aoEscolherFoto} className="hidden" />
          <Botao tamanho="grande" cor={ACCENT} larguraTotal onClick={() => entrada.current.click()}>
            <CameraIcon className="w-5 h-5" />
            Entendi, escolher a foto
          </Botao>
        </>
      )}

      {etapa === 'lendo' && <Carregando texto="Lendo o cardápio…" />}

      {(etapa === 'conferir' || etapa === 'salvando') && (
        <form onSubmit={salvar} noValidate aria-labelledby="titulo-importar-cardapio" className="flex flex-col gap-4">
          {itens.length === 0 ? (
            <p className="text-[var(--text-primary)]">Não achei itens nessa foto. Tente outra, mais de perto e sem reflexo.</p>
          ) : (
            <>
              <p className="text-sm text-[var(--text-secondary)]">Confira nome e preço. Só o que estiver marcado será salvo.</p>
              <ul className="flex flex-col gap-3">
                {itens.map((item, indice) => (
                  <li key={item.id} className="rounded-xl border border-[var(--border-subtle)] p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-3 min-h-11 flex-1 font-medium text-[var(--text-primary)]">
                        <input
                          type="checkbox"
                          checked={item.selecionado}
                          onChange={(e) => alterar(item.id, 'selecionado', e.target.checked)}
                          aria-label={`Importar ${item.nome || `item ${indice + 1}`}`}
                          className="w-6 h-6 accent-[var(--color-accent-produtos)]"
                        />
                        Importar
                      </label>
                      {item.jaCadastrado && <Etiqueta cor="var(--color-accent-pedidos)">Já cadastrado</Etiqueta>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-3">
                      <Campo
                        rotulo="Nome"
                        name={`nome-${item.id}`}
                        value={item.nome}
                        onChange={(e) => alterar(item.id, 'nome', e.target.value)}
                        maxLength={120}
                        autoComplete="off"
                        erro={erros[item.id]?.nome}
                      />
                      <Campo
                        rotulo="Preço (R$)"
                        name={`preco-${item.id}`}
                        value={item.preco}
                        onChange={(e) => alterar(item.id, 'preco', e.target.value)}
                        placeholder="0,00"
                        inputMode="decimal"
                        autoComplete="off"
                        erro={erros[item.id]?.preco}
                        dica={item.semPreco ? 'A foto não mostrava o preço.' : undefined}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            {itens.length > 0 && (
              <Botao type="submit" tamanho="grande" cor={ACCENT} larguraTotal disabled={etapa === 'salvando' || marcados.length === 0}>
                {etapa === 'salvando'
                  ? 'Salvando…'
                  : `Salvar ${marcados.length} ${marcados.length === 1 ? 'produto' : 'produtos'}`}
              </Botao>
            )}
            <Botao variante="secundaria" tamanho="grande" onClick={lerOutra} disabled={etapa === 'salvando'}>
              Ler outra foto
            </Botao>
          </div>
        </form>
      )}
    </section>
  );
}
