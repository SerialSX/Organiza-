import { useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { errorMessage, money, type Product } from '../types'

type Props = { businessId: string; products: Product[]; reload: () => Promise<void> }

export default function ProductsScreen({ businessId, products, reload }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function reset() { setEditing(null); setName(''); setPrice(''); setCost('') }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const priceValue = Number(price)
    const costValue = Number(cost)
    if (!name.trim() || !Number.isFinite(priceValue) || !Number.isFinite(costValue)
      || priceValue < 0 || costValue < 0) {
      setMessage('Informe nome, preço e custo válidos.'); return
    }
    setBusy(true); setMessage('')
    try {
      const payload = { name: name.trim(), price: priceValue, cost: costValue }
      const result = editing
        ? await supabase.from('products').update(payload).eq('id', editing).eq('business_id', businessId)
        : await supabase.from('products').insert({ ...payload, business_id: businessId })
      if (result.error) throw result.error
      await reload()
      reset()
      setMessage('Produto salvo.')
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }

  async function updateProduct(id: string, changes: Partial<Product>) {
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.from('products').update(changes)
        .eq('id', id).eq('business_id', businessId)
      if (error) throw error
      await reload()
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }

  return <section className="space-y-5">
    <form onSubmit={save} className="grid gap-3 rounded-lg bg-white p-4 shadow sm:grid-cols-4">
      <h2 className="sm:col-span-4 text-xl font-semibold">{editing ? 'Editar produto' : 'Novo produto'}</h2>
      <label>Nome<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Preço (R$)<input required type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></label>
      <label>Custo (R$)<input required type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} /></label>
      <div className="flex items-end gap-2">
        <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white">Salvar</button>
        {editing && <button type="button" onClick={reset} className="rounded border px-3 py-2">Cancelar</button>}
      </div>
    </form>
    {message && <p role="alert" className="rounded bg-white p-3">{message}</p>}
    <div className="space-y-2">
      {products.length === 0 && <p>Nenhum produto cadastrado.</p>}
      {products.map(product => <article key={product.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 shadow">
        <div><strong>{product.name}</strong><p>{money(product.price)} · custo {money(product.cost)} · {product.status}</p></div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="rounded border px-3 py-1" onClick={() => {
            setEditing(product.id); setName(product.name); setPrice(String(product.price)); setCost(String(product.cost)); setMessage('')
          }}>Editar</button>
          <button disabled={busy} className="rounded border px-3 py-1" onClick={() => void updateProduct(product.id, {
            status: product.status === 'disponivel' ? 'esgotado' : 'disponivel',
          })}>{product.status === 'disponivel' ? 'Esgotar' : 'Disponibilizar'}</button>
          <button disabled={busy} className="rounded border border-red-300 px-3 py-1 text-red-700" onClick={() => {
            if (window.confirm(`Remover ${product.name} do catálogo?`)) void updateProduct(product.id, { archived: true })
          }}>Remover</button>
        </div>
      </article>)}
    </div>
  </section>
}
