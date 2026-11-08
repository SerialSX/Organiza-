// Modelo de planilha para baixar: um .xlsx de verdade, montado aqui mesmo (sem
// biblioteca), que abre no Excel, no Google Planilhas e no celular.
// Aba 1 "Cardápio": só o cabeçalho, para preencher (é a que o Organiza+ lê).
// Aba 2 "Como preencher": explicação e um exemplo (não é importada).

export const COLUNAS_DO_MODELO = ['Produto', 'Preço', 'Vai para a cozinha?', 'Custo (se souber)'];
export const NOME_DO_MODELO = 'modelo-cardapio-organiza.xlsx';

const EXEMPLO = [
  ['Pastel de carne', 9, 'Sim', 3.5],
  ['X-Burguer', 18, 'Sim', null],
  ['Refrigerante lata', 6, 'Não', 3],
];

const COMO_PREENCHER = [
  'Como preencher a aba "Cardápio"',
  'Produto: o nome como você chama no balcão. Um produto por linha.',
  'Preço: o valor de venda, como 12,50.',
  'Vai para a cozinha?: "Sim" para o que precisa preparar. "Não" para bebida e o que já sai pronto. Em branco: o Organiza+ decide e você confere antes de salvar.',
  'Custo (se souber): quanto você gasta para fazer. Pode deixar em branco.',
  'Depois, em Produtos, toque em "Importar planilha" e escolha este arquivo. Nada é salvo antes de você conferir.',
];

const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const letra = (i) => String.fromCharCode(65 + i);

function celula(valor, coluna, linha, estilo) {
  const r = `${letra(coluna)}${linha}`;
  const s = estilo ? ` s="${estilo}"` : '';
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return `<c r="${r}"${s}><v>${valor}</v></c>`;
  return `<c r="${r}"${s} t="inlineStr"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`;
}

function linhaXml(valores, numero, estilos = []) {
  return `<row r="${numero}">${valores.map((v, i) => celula(v, i, numero, estilos[i])).join('')}</row>`;
}

const CABECA = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const LARGURAS = '<cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="2" width="12" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/><col min="4" max="4" width="18" customWidth="1"/></cols>';
const TOPO_FIXO =
  '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
// Estilos: 0 normal, 1 negrito, 2 dinheiro (0,00), 3 negrito grande.
const ESTILOS = `${CABECA}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function abaCardapio() {
  const cabecalho = linhaXml(COLUNAS_DO_MODELO, 1, [1, 1, 1, 1]);
  // Preço e custo já com o formato de dinheiro nas linhas para preencher.
  const colunasComFormato = LARGURAS.replace('max="2" width="12" customWidth="1"', 'max="2" width="12" style="2" customWidth="1"').replace(
    'max="4" width="18" customWidth="1"',
    'max="4" width="18" style="2" customWidth="1"',
  );
  return `${CABECA}<worksheet ${NS}><dimension ref="A1:D1"/>${TOPO_FIXO}${colunasComFormato}<sheetData>${cabecalho}</sheetData><dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Sim ou Não" error="Escolha Sim ou Não." sqref="C2:C1000"><formula1>"Sim,Não"</formula1></dataValidation></dataValidations></worksheet>`;
}

function abaComoPreencher() {
  const linhas = [];
  let n = 1;
  linhas.push(linhaXml([COMO_PREENCHER[0]], n++, [3]));
  for (const texto of COMO_PREENCHER.slice(1)) linhas.push(linhaXml([texto], n++));
  n++;
  linhas.push(linhaXml(['Exemplo preenchido:'], n++, [1]));
  linhas.push(linhaXml(COLUNAS_DO_MODELO, n++, [1, 1, 1, 1]));
  for (const ex of EXEMPLO) linhas.push(linhaXml(ex, n++, [0, 2, 0, 2]));
  return `${CABECA}<worksheet ${NS}><dimension ref="A1:D${n - 1}"/>${LARGURAS}<sheetData>${linhas.join('')}</sheetData></worksheet>`;
}

function partes() {
  return [
    [
      '[Content_Types].xml',
      `${CABECA}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      '_rels/.rels',
      `${CABECA}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `${CABECA}<workbook ${NS}><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Cardápio" sheetId="1" r:id="rId1"/><sheet name="Como preencher" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `${CABECA}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ['xl/styles.xml', ESTILOS],
    ['xl/worksheets/sheet1.xml', abaCardapio()],
    ['xl/worksheets/sheet2.xml', abaComoPreencher()],
  ];
}

let tabelaCrc;
function crc32(bytes) {
  if (!tabelaCrc) {
    tabelaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabelaCrc[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = tabelaCrc[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP sem compressão ("stored"): pequeno o bastante e fácil de conferir.
function montarZip(arquivos) {
  const cod = new TextEncoder();
  const locais = [];
  const centrais = [];
  let pos = 0;
  for (const [nome, texto] of arquivos) {
    const nomeB = cod.encode(nome);
    const dados = cod.encode(texto);
    const crc = crc32(dados);
    const local = new Uint8Array(30 + nomeB.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // nomes em UTF-8
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x21, true); // 1980-01-01
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dados.length, true);
    lv.setUint32(22, dados.length, true);
    lv.setUint16(26, nomeB.length, true);
    local.set(nomeB, 30);

    const central = new Uint8Array(46 + nomeB.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dados.length, true);
    cv.setUint32(24, dados.length, true);
    cv.setUint16(28, nomeB.length, true);
    cv.setUint32(42, pos, true);
    central.set(nomeB, 46);

    locais.push(local, dados);
    centrais.push(central);
    pos += local.length + dados.length;
  }
  const tamCentral = centrais.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, arquivos.length, true);
  fv.setUint16(10, arquivos.length, true);
  fv.setUint32(12, tamCentral, true);
  fv.setUint32(16, pos, true);

  const total = new Uint8Array(pos + tamCentral + 22);
  let i = 0;
  for (const parte of [...locais, ...centrais, fim]) {
    total.set(parte, i);
    i += parte.length;
  }
  return total;
}

export function bytesDoModelo() {
  return montarZip(partes());
}

export function baixarModelo() {
  const blob = new Blob([bytesDoModelo()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = NOME_DO_MODELO;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
