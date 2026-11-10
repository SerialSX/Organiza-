// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {recarregarUmaVez} from './recarga';
it('TEL-01: offline não recarrega nem agenda recarga ao voltar',()=>{
  vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
  const spy=vi.spyOn(window,'addEventListener');
  expect(recarregarUmaVez()).toBe(false);
  expect(spy.mock.calls.some(([evento])=>evento==='online')).toBe(false);
  vi.restoreAllMocks();
});
