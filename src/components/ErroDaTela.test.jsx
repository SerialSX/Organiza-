// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {it,expect,vi} from 'vitest';
import ErroDaTela from './ErroDaTela';
vi.mock('./ui/AppShell',()=>({default:()=>{throw new Error('menu quebrou');}}));
function Quebra(){throw new Error('tela quebrou');}
it('erro no próprio menu mostra o aviso simples, não a tela em branco',async()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div'),root=createRoot(host);
  const erro=vi.spyOn(console,'error').mockImplementation(()=>{});
  await act(()=>root.render(<MemoryRouter><ErroDaTela><ErroDaTela comMenu><Quebra/></ErroDaTela></ErroDaTela></MemoryRouter>));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Algo deu errado nesta tela');
  expect(host.querySelector('a[href="/pedidos"]')).not.toBeNull();
  erro.mockRestore();
  await act(()=>root.unmount());
});
