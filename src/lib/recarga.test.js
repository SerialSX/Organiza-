import { describe, expect, it } from 'vitest';
import { ehArquivoDeVersaoAntiga } from './recarga';

describe('tela aberta durante um deploy', () => {
  it('reconhece o erro de arquivo do build antigo em cada navegador', () => {
    expect(ehArquivoDeVersaoAntiga(new TypeError('Failed to fetch dynamically imported module: /assets/Cozinha-abc.js'))).toBe(true);
    expect(ehArquivoDeVersaoAntiga(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(ehArquivoDeVersaoAntiga(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it('não confunde com outros erros', () => {
    expect(ehArquivoDeVersaoAntiga(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});
