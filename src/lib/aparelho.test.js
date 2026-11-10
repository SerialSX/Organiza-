import { describe, expect, it } from 'vitest';
import { comoAbrirNoNavegador, ehIphone, navegadorDeDentro } from './aparelho';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

describe('navegador de dentro de outro app', () => {
  it('reconhece Instagram, Facebook, WhatsApp e o app do Google', () => {
    expect(navegadorDeDentro(`${CHROME_ANDROID} Instagram 350.0.0.0.1 Android`)).toBe('Instagram');
    expect(navegadorDeDentro(`${SAFARI_IPHONE} [FBAN/FBIOS;FBAV/480.0]`)).toBe('Facebook');
    expect(navegadorDeDentro(`${CHROME_ANDROID} WhatsApp/2.24.1`)).toBe('WhatsApp');
    expect(navegadorDeDentro(SAFARI_IPHONE.replace('Version/17.5', 'GSA/340.0.1'))).toBe('Google');
  });

  it('WebView de Android sem nome conhecido vira "outro app"', () => {
    expect(navegadorDeDentro(CHROME_ANDROID.replace('SM-A145M)', 'SM-A145M; wv)'))).toBe('outro app');
  });

  it('Chrome e Safari de verdade não são navegador de dentro', () => {
    expect(navegadorDeDentro(CHROME_ANDROID)).toBe(null);
    expect(navegadorDeDentro(SAFARI_IPHONE)).toBe(null);
  });

  it('explica como sair no iPhone e no Android', () => {
    expect(ehIphone(SAFARI_IPHONE)).toBe(true);
    expect(comoAbrirNoNavegador(SAFARI_IPHONE)).toContain('Abrir no Safari');
    expect(comoAbrirNoNavegador(CHROME_ANDROID)).toContain('Abrir no Chrome');
  });
});
