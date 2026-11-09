// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { usePedidosDoDia } from './usePedidosDoDia';
import { CONFERENCIA_LONGA, usePedidosAbertos } from './usePedidosAbertos';
import { usePendenciasAnteriores } from './usePendenciasAnteriores';
import * as pedidos from '../services/pedidos';
vi.mock('../context/useAuth',()=>({useAuth:()=>({perfil:{negocio_id:'n'}})}));
vi.mock('./useRecarregarAoVoltar',()=>({useRecarregarAoVoltar:()=>{}}));
vi.mock('../services/pedidos',()=>({listarPedidosDoPeriodo:vi.fn(),listarPedidosAbertos:vi.fn(),listarPendenciasAnteriores:vi.fn(),assinarPedidos:vi.fn(()=>()=>{})}));
vi.mock('../services/mesas',()=>({listarContasDoDia:vi.fn(async()=>[])}));
vi.mock('../services/fimDoDia',()=>({buscarEncerramento:vi.fn(async()=>null)}));
let root,host,estado;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(()=>root.unmount());host.remove();vi.useRealTimers();});
const pendente=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {resolve,reject,promise};};
for(const [nome,useHook,servico] of [['dia',usePedidosDoDia,'listarPedidosDoPeriodo'],['abertos',usePedidosAbertos,'listarPedidosAbertos'],['anteriores',usePendenciasAnteriores,'listarPendenciasAnteriores']]) {
  it('TEL-05: '+nome+' conserva a resposta mais nova',async()=>{
    const a=pendente(),b=pendente();
    pedidos[servico].mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    function Tela(){estado=useHook();return null;}
    await act(()=>root.render(<Tela/>));
    let recarga;
    await act(()=>{recarga=estado.recarregar();});
    await act(async()=>{b.resolve([{id:'novo'}]);await recarga;});
    await act(async()=>{a.resolve([{id:'velho'}]);await a.promise;});
    expect(estado.pedidos).toEqual([{id:'novo'}]);
  });
}
it('TEL-05: erro ao abrir ontem não deixa dados de hoje',async()=>{
  pedidos.listarPedidosDoPeriodo.mockResolvedValueOnce([{id:'hoje'}]).mockRejectedValueOnce(new Error('Falhou'));
  function Tela({dia}){estado=usePedidosDoDia(dia);return null;}
  await act(()=>root.render(<Tela dia="2026-11-08"/>));
  expect(estado.pedidos).toEqual([{id:'hoje'}]);
  await act(()=>root.render(<Tela dia="2026-11-07"/>));
  expect(estado.pedidos).toEqual([]);
  expect(estado.contas).toEqual([]);
  expect(estado.erro).toBe('Falhou');
});

it('CAR-01: Pedidos parado por um minuto só carrega uma vez com tempo real',async()=>{
  vi.useFakeTimers();pedidos.listarPedidosDoPeriodo.mockResolvedValue([]);
  pedidos.assinarPedidos.mockImplementation((_,callback,status)=>{status(true);return ()=>{};});
  const {listarContasDoDia}=await import('../services/mesas');
  const {buscarEncerramento}=await import('../services/fimDoDia');
  function Tela(){estado=usePedidosDoDia('2026-11-08',{comContas:false,comEncerramento:false});return null;}
  await act(()=>root.render(<Tela/>));
  await act(()=>vi.advanceTimersByTimeAsync(60000));
  expect(pedidos.listarPedidosDoPeriodo).toHaveBeenCalledTimes(1);
  expect(listarContasDoDia).not.toHaveBeenCalled();
  expect(buscarEncerramento).not.toHaveBeenCalled();
  const callback=pedidos.assinarPedidos.mock.calls[0][1];
  await act(()=>{callback({new:{dia:'2026-11-07'}});});
  await act(()=>vi.advanceTimersByTimeAsync(500));
  expect(pedidos.listarPedidosDoPeriodo).toHaveBeenCalledTimes(1);
  await act(()=>{callback({new:{dia:'2026-11-08'}});});
  await act(()=>vi.advanceTimersByTimeAsync(500));
  expect(pedidos.listarPedidosDoPeriodo).toHaveBeenCalledTimes(2);
});

it('Cozinha confere a cada 8 s sem tempo real e a cada 30 s com ele; Início e Pedidos usam os longos',async()=>{
  vi.useFakeTimers();pedidos.listarPedidosAbertos.mockResolvedValue([]);
  let status;
  pedidos.assinarPedidos.mockImplementation((_,__,s)=>{status=s;return ()=>{};});
  function Cozinha(){estado=usePedidosAbertos();return null;}
  await act(()=>root.render(<Cozinha/>));
  await act(()=>{status(false);});
  await act(()=>vi.advanceTimersByTimeAsync(16000));
  expect(pedidos.listarPedidosAbertos).toHaveBeenCalledTimes(3);
  await act(()=>{status(true);});
  await act(()=>vi.advanceTimersByTimeAsync(30000));
  expect(pedidos.listarPedidosAbertos).toHaveBeenCalledTimes(4);
  await act(()=>root.unmount());root=createRoot(host);vi.clearAllMocks();
  pedidos.listarPedidosAbertos.mockResolvedValue([]);
  function Inicio(){estado=usePedidosAbertos(CONFERENCIA_LONGA);return null;}
  await act(()=>root.render(<Inicio/>));
  await act(()=>{status(true);});
  await act(()=>vi.advanceTimersByTimeAsync(60000));
  expect(pedidos.listarPedidosAbertos).toHaveBeenCalledTimes(1);
});
