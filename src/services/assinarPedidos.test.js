import {it,expect,vi} from 'vitest';
import {assinarPedidos} from './pedidos';
const {canal}=vi.hoisted(()=>{const canal={on:()=>canal,subscribe:(f)=>{canal.status=f;return canal;}};return {canal};});
vi.mock('../lib/supabaseClient',()=>({isSupabaseConfigured:true,supabase:{channel:()=>canal,removeChannel:vi.fn()}}));
it('recarrega já na primeira conexão do tempo real e em cada reconexão',()=>{
  const callback=vi.fn(),conexao=vi.fn();
  assinarPedidos('n',callback,conexao);
  canal.status('SUBSCRIBED');
  expect(callback).toHaveBeenCalledTimes(1);
  canal.status('CHANNEL_ERROR');
  canal.status('SUBSCRIBED');
  expect(callback).toHaveBeenCalledTimes(2);
  expect(conexao.mock.calls).toEqual([[true],[false],[true]]);
});
