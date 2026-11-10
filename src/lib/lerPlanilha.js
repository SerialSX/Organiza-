// Lê a primeira aba de uma planilha (.xlsx do Excel ou do Google Planilhas, ou
// .csv) e devolve as linhas como listas de células (texto, número ou null).
// Sem biblioteca: o .xlsx é um ZIP com XML dentro, e o navegador já descompacta
// (DecompressionStream). Nada sai do aparelho.

export const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export class ErroDePlanilha extends Error {}

const ERRO_FORMATO =
  'Não consegui abrir esse arquivo. Use o modelo do Organiza+ ou salve a sua planilha como .xlsx (no Excel: Salvar como → Pasta de Trabalho do Excel; no Google Planilhas: Arquivo → Fazer download → .xlsx).';

export async function lerArquivoDePlanilha(arquivo) {
  if (arquivo.size > TAMANHO_MAXIMO) {
    throw new ErroDePlanilha('Essa planilha é grande demais (mais de 5 MB). Deixe só a lista de produtos e tente de novo.');
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  return lerBytesDePlanilha(bytes, arquivo.name ?? '');
}

export async function lerBytesDePlanilha(bytes, nome = '') {
  const ext = nome.toLowerCase().split('.').pop();
  // PK: ZIP (.xlsx, mas também .ods e .numbers, que não têm as mesmas partes).
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return lerXlsx(bytes);
  // Formato antigo do Excel (.xls), binário.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new ErroDePlanilha(
      'Essa planilha está no formato antigo do Excel (.xls). Abra no Excel e use Salvar como → Pasta de Trabalho do Excel (.xlsx), ou use o modelo do Organiza+.',
    );
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    throw new ErroDePlanilha('Esse arquivo é um PDF. Para ler um cardápio em PDF ou foto, use "Importar do cardápio".');
  }
  if (['csv', 'txt', 'tsv'].includes(ext) || ehTexto(bytes)) return lerCsv(decodificarTexto(bytes));
  throw new ErroDePlanilha(ERRO_FORMATO);
}

function ehTexto(bytes) {
  const amostra = bytes.subarray(0, 2000);
  return amostra.length > 0 && !amostra.some((b) => b === 0);
}

// UTF-8 (com ou sem BOM); se não for UTF-8 válido, é o Windows-1252 que o
// Excel usa ao salvar .csv no Brasil.
function decodificarTexto(bytes) {
  try {
    // O TextDecoder já tira o BOM do começo.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// ---------- CSV ----------

// Separador: o que mais aparece fora de aspas na primeira linha com conteúdo
// (o Excel no Brasil usa ";").
function separadorDoCsv(texto) {
  const primeira = texto.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  let melhor = ',';
  let maior = -1;
  for (const sep of [';', '\t', ',']) {
    let n = 0;
    let aspas = false;
    for (const c of primeira) {
      if (c === '"') aspas = !aspas;
      else if (c === sep && !aspas) n++;
    }
    if (n > maior) {
      maior = n;
      melhor = sep;
    }
  }
  return melhor;
}

export function lerCsv(texto) {
  const sep = separadorDoCsv(texto);
  const linhas = [];
  let linha = [];
  let celula = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') aspas = false;
      else celula += c;
    } else if (c === '"' && celula === '') aspas = true;
    else if (c === sep) {
      linha.push(celula);
      celula = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = '';
    } else celula += c;
  }
  if (celula !== '' || linha.length) {
    linha.push(celula);
    linhas.push(linha);
  }
  return linhas.map((l) => l.map((c) => (c.trim() === '' ? null : c.trim())));
}

// ---------- XLSX ----------

// Arquivos do ZIP: lê o diretório central (no fim do arquivo), que tem os
// tamanhos certos mesmo quando o cabeçalho local não tem.
function arquivosDoZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new ErroDePlanilha(ERRO_FORMATO);
  const total = dv.getUint16(fim + 10, true);
  let pos = dv.getUint32(fim + 16, true);
  const arquivos = new Map();
  const nomes = new TextDecoder('utf-8');
  for (let n = 0; n < total; n++) {
    if (pos + 46 > bytes.length || dv.getUint32(pos, true) !== 0x02014b50) throw new ErroDePlanilha(ERRO_FORMATO);
    const metodo = dv.getUint16(pos + 10, true);
    const tamanho = dv.getUint32(pos + 20, true);
    const tamNome = dv.getUint16(pos + 28, true);
    const tamExtra = dv.getUint16(pos + 30, true);
    const tamComentario = dv.getUint16(pos + 32, true);
    const local = dv.getUint32(pos + 42, true);
    const nome = nomes.decode(bytes.subarray(pos + 46, pos + 46 + tamNome));
    arquivos.set(nome, { metodo, tamanho, local });
    pos += 46 + tamNome + tamExtra + tamComentario;
  }
  return {
    async ler(nome) {
      const a = arquivos.get(nome);
      if (!a) return null;
      if (a.local + 30 > bytes.length || dv.getUint32(a.local, true) !== 0x04034b50) throw new ErroDePlanilha(ERRO_FORMATO);
      const inicio = a.local + 30 + dv.getUint16(a.local + 26, true) + dv.getUint16(a.local + 28, true);
      const dados = bytes.subarray(inicio, inicio + a.tamanho);
      if (a.metodo === 0) return new TextDecoder('utf-8').decode(dados);
      if (a.metodo !== 8) throw new ErroDePlanilha(ERRO_FORMATO);
      if (typeof DecompressionStream === 'undefined') {
        throw new ErroDePlanilha('Este navegador não abre arquivos .xlsx. Atualize o navegador ou salve a planilha como .csv.');
      }
      const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(fluxo).text();
    },
  };
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodificarXml(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (inteira, e) => {
    if (e[0] === '#') {
      const codigo = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteira;
    }
    return ENTIDADES[e] ?? inteira;
  });
}

// Prefixo opcional: alguns programas gravam <x:c> em vez de <c>.
const P = '(?:[\\w-]+:)?';
const textosDe = (xml) =>
  [...xml.matchAll(new RegExp(`<${P}t(?:\\s[^>]*)?>([\\s\\S]*?)</${P}t>`, 'g'))].map((m) => decodificarXml(m[1])).join('');
// Texto com formatação (<r><rPh>) fica fora: rPh é a pronúncia japonesa.
const semFonetica = (xml) => xml.replace(new RegExp(`<${P}rPh[\\s\\S]*?</${P}rPh>`, 'g'), '');

function atributo(tag, nome) {
  const m = tag.match(new RegExp(`\\s${nome}="([^"]*)"`));
  return m ? decodificarXml(m[1]) : null;
}

function colunaDe(ref) {
  const letras = /^[A-Z]+/i.exec(ref ?? '')?.[0];
  if (!letras) return null;
  let n = 0;
  for (const l of letras.toUpperCase()) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

async function caminhoDaPrimeiraAba(zip) {
  const pasta = await zip.ler('xl/workbook.xml');
  const rels = await zip.ler('xl/_rels/workbook.xml.rels');
  if (pasta && rels) {
    const aba = new RegExp(`<${P}sheet\\s[^>]*>`).exec(pasta)?.[0];
    const id = aba && (atributo(aba, 'r:id') ?? atributo(aba, '[\\w-]+:id'));
    if (id) {
      for (const [rel] of rels.matchAll(new RegExp(`<${P}Relationship\\s[^>]*>`, 'g'))) {
        if (atributo(rel, 'Id') === id) {
          const alvo = atributo(rel, 'Target');
          if (alvo) return alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`;
        }
      }
    }
  }
  return 'xl/worksheets/sheet1.xml';
}

async function lerXlsx(bytes) {
  const zip = arquivosDoZip(bytes);
  const caminho = await caminhoDaPrimeiraAba(zip);
  const aba = await zip.ler(caminho);
  if (!aba) throw new ErroDePlanilha(ERRO_FORMATO);
  const compartilhado = await zip.ler('xl/sharedStrings.xml');
  const textos = compartilhado
    ? [...compartilhado.matchAll(new RegExp(`<${P}si(?:\\s[^>]*)?>([\\s\\S]*?)</${P}si>`, 'g'))].map((m) => textosDe(semFonetica(m[1])))
    : [];

  const linhas = [];
  // Atributos sem gula: <row r="1"/> não pode engolir a linha seguinte.
  const reLinha = new RegExp(`<${P}row(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${P}row>)`, 'g');
  const reCelula = new RegExp(`<${P}c(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${P}c>)`, 'g');
  const reValor = new RegExp(`<${P}v(?:\\s[^>]*)?>([\\s\\S]*?)</${P}v>`);
  for (const [, , corpo] of aba.matchAll(reLinha)) {
    const linha = [];
    let proxima = 0;
    for (const [, attrs = '', conteudo = ''] of (corpo ?? '').matchAll(reCelula)) {
      const tag = ` ${attrs}`;
      const coluna = colunaDe(atributo(tag, 'r')) ?? proxima;
      proxima = coluna + 1;
      const tipo = atributo(tag, 't');
      const bruto = reValor.exec(conteudo)?.[1];
      let valor;
      if (tipo === 'inlineStr') valor = textosDe(semFonetica(conteudo));
      else if (bruto === undefined) valor = null;
      else if (tipo === 's') valor = textos[Number(bruto)] ?? null;
      else if (tipo === 'str') valor = decodificarXml(bruto);
      else if (tipo === 'b') valor = bruto === '1';
      else if (tipo === 'e') valor = null;
      else {
        const numero = Number(bruto);
        valor = Number.isFinite(numero) ? numero : decodificarXml(bruto);
      }
      if (typeof valor === 'string') valor = valor.trim() === '' ? null : valor.trim();
      if (coluna < 100) linha[coluna] = valor;
    }
    linhas.push(Array.from(linha, (v) => v ?? null));
  }
  return linhas;
}
