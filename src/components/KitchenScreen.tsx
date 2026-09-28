import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { errorMessage, money, type Order, type OrderStatus, type Product } from '../types'

type Props = { businessId: string; products: Product[]; reloadProducts: () => Promise<void> }

export default function KitchenScreen({ businessId, products, reloadProducts }: Props) {
  const [orders, setOrders] = useState<Order[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [realtime, setRealtime] = useState('Conectando...')

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase.from('orders')
      .select('id,status,total,created_at,order_items(id,product_id,quantity,unit_price,products(name))')
      .eq('business_id', businessId).neq('status', 'entregue')
      .order('created_at', { ascending: true })
    if (error) { setMessage(error.message); return }
    setOrders((data || []).map(order => ({
      ...order,
      order_items: order.order_items.map(item => ({
        ...item,
        products: Array.isArray(item.products) ? item.products[0] || null : item.products,
      })),
    })) as Order[])
  }, [businessId])

  useEffect(() => {
    // A consulta inicial e a consulta após SUBSCRIBED cobrem a janela de conexão.
    void loadOrders()
    const channel = supabase.channel(`kitchen-${businessId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders', filter: `business_id=eq.${businessId}`,
      }, () => { void loadOrders() })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { setRealtime('Ao vivo'); void loadOrders() }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtime('Conexão instável; use Atualizar')
      })
    return () => { void supabase.removeChannel(channel) }
  }, [businessId, loadOrders])

  async function changeStatus(id: string, status: OrderStatus) {
    setBusyId(id); setMessage('')
    try {
      const { error } = await supabase.rpc('set_order_status', { p_order_id: id, p_status: status })
      if (error) throw error
      await loadOrders()
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusyId(null) }
  }

  async function markSoldOut(productId: string) {
    setBusyId(productId); setMessage('')
    try {
      const { error } = await supabase.from('products').update({ status: 'esgotado' })
        .eq('id', productId).eq('business_id', businessId)
      if (error) throw error
      await reloadProducts()
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusyId(null) }
  }

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Cozinha · {realtime}</h2>
      <button onClick={() => void loadOrders()} className="rounded border bg-white px-3 py-2">Atualizar</button>
    </div>
    {message && <p role="alert" className="rounded bg-white p-3">{message}</p>}
    {orders.length === 0 && <p>Nenhum pedido em aberto.</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      {orders.map(order => <article key={order.id} className="rounded-lg bg-white p-4 shadow">
        <div className="flex justify-between gap-2">
          <div><h3 className="font-bold">Pedido {order.id.slice(0, 8)}</h3>
            <p className="text-sm text-slate-600">{new Date(order.created_at).toLocaleString('pt-BR')} · {order.status}</p></div>
          <strong>{money(order.total)}</strong>
        </div>
        <ul className="my-4 space-y-2">
          {order.order_items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
            <span>{item.quantity} × {item.products?.name || 'Produto'} · {money(item.unit_price)}</span>
            {products.some(product => product.id === item.product_id && product.status === 'disponivel') &&
              <button disabled={busyId !== null} onClick={() => void markSoldOut(item.product_id)}
                className="rounded border border-amber-500 px-2 py-1 text-sm">Esgotado</button>}
          </li>)}
        </ul>
        <div className="flex flex-wrap gap-2">
          {order.status === 'pendente' && <button disabled={busyId !== null} onClick={() => void changeStatus(order.id, 'preparando')}
            className="rounded bg-blue-700 px-3 py-2 text-white">Preparando</button>}
          {(order.status === 'pendente' || order.status === 'preparando') &&
            <button disabled={busyId !== null} onClick={() => void changeStatus(order.id, 'pronto')}
              className="rounded bg-green-700 px-3 py-2 text-white">Pronto</button>}
          {order.status === 'pronto' && <button disabled={busyId !== null} onClick={() => void changeStatus(order.id, 'entregue')}
            className="rounded bg-slate-800 px-3 py-2 text-white">Entregue</button>}
        </div>
      </article>)}
    </div>
  </section>
}
