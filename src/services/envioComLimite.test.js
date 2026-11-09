// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {criarPedido} from './pedidos';
import {guardarNaFila,lerFila} from './filaDeEnvio';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../lib/supabaseClient',()=>({isSupabaseConfigured:true,supabase:{rpc}}));
beforeEach(()=>{vi.useFakeTimers();localStorage.clear();});
afterEach(()=>vi.useRealTimers());
it('TEL-03: RPC sem resposta vai para a fila aos 15 segundos, com a mesma chave',async()=>{
  rpc.mockReturnValue(new Promise(()=>{}));
  const envio={negocioId:'n',usuarioId:'u',chaveEnvio:'k',itens:[{produto_id:'x',quantidade:1}]};
  const tentativa=criarPedido(envio).catch(e=>{if(e.semInternet)guardarNaFila('n',envio);else throw e;});
  await vi.advanceTimersByTimeAsync(14999);
  expect(lerFila('n')).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);await tentativa;
  expect(lerFila('n')[0].chaveEnvio).toBe('k');
});
