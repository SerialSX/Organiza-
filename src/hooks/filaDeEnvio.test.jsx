// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useFilaDeEnvio} from './useFilaDeEnvio';
import {guardarNaFila,lerFila,lerSaidas} from '../services/filaDeEnvio';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../lib/supabaseClient',()=>({isSupabaseConfigured:true,supabase:{rpc}}));
let root,estado;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();root=createRoot(document.createElement('div'));});
afterEach(async()=>{await act(()=>root.unmount());localStorage.clear();});
it.each([
  ['rede',()=>Promise.reject(new TypeError('Failed to fetch')),false],
  ['503',()=>Promise.resolve({error:{code:'503',message:'<html>Unavailable</html>'}}),false],
  ['P0001',()=>Promise.resolve({error:{code:'P0001',message:'Produto esgotou.'}}),true],
  ['PostgREST',()=>Promise.resolve({error:{code:'PGRST202',message:'Could not find the function'}}),true],
  ['forma antiga',()=>Promise.resolve({error:{code:'23514',message:'violates check constraint'}}),true],
  ['504 com status',()=>Promise.resolve({error:{status:504,message:'Gateway Timeout'}}),false],
  // Como o postgrest-js responde de verdade: o status vem na resposta, não no erro.
  ['502 com página HTML',()=>Promise.resolve({data:null,error:{message:'<html><body>502 Bad Gateway</body></html>'},status:502}),false],
  ['503 PGRST002',()=>Promise.resolve({data:null,error:{code:'PGRST002',message:'Could not query the database for the schema cache. Retrying.'},status:503}),false],
  ['500 erro interno',()=>Promise.resolve({data:null,error:{code:'XX000',message:'internal error'},status:500}),true],
])('TEL-04: %s só é definitivo quando o banco recusa',async(_,resposta,definitivo)=>{
  rpc.mockImplementation(resposta);
  guardarNaFila('n',{chaveEnvio:'k',itens:[{produto_id:'x',quantidade:1}]});
  function Tela(){estado=useFilaDeEnvio({negocioId:'n',usuarioId:'u'});return null;}
  await act(()=>root.render(<Tela/>));
  expect(Boolean(lerFila('n')[0].erro)).toBe(definitivo);
  expect(rpc.mock.calls.at(-1)[1].p_itens[0].promocao_em).toBe(lerFila('n')[0].guardadoEm);
  if(definitivo) {
    rpc.mockResolvedValue({data:{id:'p',numero:14,status:'pendente',criado_em:new Date().toISOString()}});
    await act(()=>estado.tentarDeNovo('k'));
    expect(lerFila('n')).toEqual([]);
    expect(lerSaidas('n')[0].numero).toBe(14);
  }
});
