import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { lerBytesDePlanilha, lerCsv, ErroDePlanilha } from './lerPlanilha';
import { bytesDoModelo, COLUNAS_DO_MODELO } from './modeloDePlanilha';

// ZIP compactado (deflate), como o Excel e o Google Planilhas salvam.
function zipCompactado(arquivos) {
  const cod = new TextEncoder();
  const partes = [];
  const centrais = [];
  let pos = 0;
  for (const [nome, texto] of Object.entries(arquivos)) {
    const nomeB = cod.encode(nome);
    const dados = deflateRawSync(Buffer.from(texto, 'utf8'));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    // Tamanhos zerados no cabeçalho local (como quem grava com "data descriptor").
    local.writeUInt16LE(nomeB.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt16LE(nomeB.length, 28);
    central.writeUInt32LE(pos, 42);
    partes.push(local, nomeB, dados);
    centrais.push(central, nomeB);
    pos += 30 + nomeB.length + dados.length;
  }
  const tamCentral = centrais.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(tamCentral, 12);
  fim.writeUInt32LE(pos, 16);
  return new Uint8Array(Buffer.concat([...partes, ...centrais, fim]));
}

describe('lerBytesDePlanilha', () => {
  it('lê o próprio modelo: a primeira aba tem só o cabeçalho', async () => {
    const linhas = await lerBytesDePlanilha(bytesDoModelo(), 'modelo.xlsx');
    expect(linhas).toEqual([COLUNAS_DO_MODELO]);
  });

  it('lê .xlsx compactado com textos compartilhados, números, texto na célula e prefixo x:', async () => {
    const bytes = zipCompactado({
      'xl/workbook.xml':
        '<x:workbook xmlns:x="a" xmlns:r="b"><x:sheets><x:sheet name="Lista" sheetId="7" r:id="rId9"/></x:sheets></x:workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId9" Target="/xl/worksheets/minha.xml"/></Relationships>',
      'xl/sharedStrings.xml':
        '<sst><si><t>Produto</t></si><si><t>Preço</t></si><si><r><t>Pastel </t></r><r><t>de carne &amp; queijo</t></r></si></sst>',
      'xl/worksheets/minha.xml':
        '<x:worksheet><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="s"><x:v>1</x:v></x:c></x:row>' +
        '<x:row r="2"/>' +
        '<x:row r="3"><x:c r="A3" t="s"><x:v>2</x:v></x:c><x:c r="C3"><x:v>12.5</x:v></x:c></x:row>' +
        '<x:row r="4"><x:c r="A4" t="inlineStr"><x:is><x:t>Coca 2L</x:t></x:is></x:c><x:c r="B4" t="str"><x:v>R$ 12,00</x:v></x:c></x:row>' +
        '</x:sheetData></x:worksheet>',
    });
    const linhas = await lerBytesDePlanilha(bytes, 'cardapio.xlsx');
    expect(linhas).toEqual([['Produto', 'Preço'], [], ['Pastel de carne & queijo', null, 12.5], ['Coca 2L', 'R$ 12,00']]);
  });

  it('CSV do Excel brasileiro: ";", aspas e acentos em Windows-1252', async () => {
    const texto = 'Produto;Preço\r\n"Pastel ""especial""; grande";12,50\r\nCaldo de cana;6\r\n';
    const latin1 = Uint8Array.from(texto, (c) => c.charCodeAt(0));
    expect(await lerBytesDePlanilha(latin1, 'c.csv')).toEqual([
      ['Produto', 'Preço'],
      ['Pastel "especial"; grande', '12,50'],
      ['Caldo de cana', '6'],
    ]);
  });

  it('CSV com vírgula e com BOM (UTF-8) do Google Planilhas', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('nome,valor\nX-Tudo,"28,00"\nCoração,5\n')]);
    expect(await lerBytesDePlanilha(bytes, 'g.csv')).toEqual([
      ['nome', 'valor'],
      ['X-Tudo', '28,00'],
      ['Coração', '5'],
    ]);
    expect(lerCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('explica o que fazer com .xls antigo e PDF', async () => {
    await expect(lerBytesDePlanilha(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), 'velho.xls')).rejects.toThrow(/formato antigo/);
    await expect(lerBytesDePlanilha(new TextEncoder().encode('%PDF-1.4'), 'menu.pdf')).rejects.toThrow(/Importar do cardápio/);
    await expect(lerBytesDePlanilha(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), 'quebrado.xlsx')).rejects.toBeInstanceOf(ErroDePlanilha);
    await expect(lerBytesDePlanilha(new Uint8Array([1, 0, 2, 0]), 'foto.jpg')).rejects.toThrow(/salve a sua planilha como .xlsx/);
  });
});
