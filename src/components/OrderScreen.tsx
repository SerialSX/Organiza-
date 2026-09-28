import { useState } from 'react'
import { supabase } from '../supabase'
import { errorMessage, money, type Product } from '../types'

export default function OrderScreen({ products }: { products: Product[] }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const available = products.filter(product => product.status === 'disponivel')
  const items = available.filter(product => (quantities[product.id] || 0) > 0)
  const total = items.reduce((sum, product) => sum + product.price * quantities[product.id], 0)

  async function placeOrder() {
    if (items.length === 0) return
    setBusy(true); setMessage('')
    try {
      const { data, error } = await supabase.rpc('place_order', {
        p_items: items.map(product => ({ product_id: product.id, quantity: quantities[product.id] })),
      })
      if (error) throw error
      setQuantities({})
      setMessage(`Pedido ${String(data).slice(0, 8)} lançado. Total confirmado pelo banco.`)
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }

  return <section className="space-y-4">
    <h2 className="text-xl font-semibold">Comanda digital</h2>
    {available.length === 0 && <p>Cadastre ou disponibilize produtos para lançar pedidos.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      {available.map(product => <label key={product.id} className="flex items-center justify-between gap-4 rounded-lg bg-white p-4 shadow">
        <span><strong>{product.name}</strong><br />{money(product.price)}</span>
        <input aria-label={`Quantidade de ${product.name}`} className="!w-24" type="number" min="0" max="999" step="1"
          value={quantities[product.id] || 0} onChange={event => {
            const value = Number(event.target.value)
            setQuantities(current => ({ ...current, [product.id]: Number.isInteger(value) && value >= 0 ? Math.min(value, 999) : 0 }))
          }} />
      </label>)}
    </div>
    <div className="rounded-lg bg-white p-4 shadow">
      <p className="mb-3 font-semibold">Total estimado: {money(total)}</p>
      <button disabled={busy || items.length === 0} onClick={() => void placeOrder()} className="rounded bg-green-700 px-5 py-2 text-white">
        {busy ? 'Lançando...' : 'Lançar Pedido'}
      </button>
    </div>
    {message && <p role="alert" className="rounded bg-white p-3">{message}</p>}
  </section>
}
