import { useState, type FormEvent } from 'react'
import { money, type Order, type OrderStatus, type Product } from './types'

type Screen = 'auth' | 'order' | 'kitchen' | 'products' | 'reports'

const initialProducts: Product[] = [
  { id: '1', business_id: 'demo', name: 'Hambúrguer artesanal', price: 22, cost: 9, status: 'disponivel', archived: false },
  { id: '2', business_id: 'demo', name: 'Batata frita', price: 12, cost: 4, status: 'disponivel', archived: false },
  { id: '3', business_id: 'demo', name: 'Refrigerante', price: 6, cost: 3, status: 'disponivel', archived: false },
]

const initialOrders: Order[] = [{
  id: 'demo-001', status: 'pendente', total: 34, created_at: new Date().toISOString(),
  order_items: [
    { id: 'demo-item-1', product_id: '1', quantity: 1, unit_price: 22, products: { name: 'Hambúrguer artesanal' } },
    { id: 'demo-item-2', product_id: '2', quantity: 1, unit_price: 12, products: { name: 'Batata frita' } },
  ],
}]

export default function PreviewApp() {
  const [screen, setScreen] = useState<Screen>('order')
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const activeProducts = products.filter(product => !product.archived)
  const available = activeProducts.filter(product => product.status === 'disponivel')
  const selected = available.filter(product => (quantities[product.id] || 0) > 0)
  const estimatedTotal = selected.reduce((sum, product) => sum + product.price * quantities[product.id], 0)
  const delivered = orders.filter(order => order.status === 'entregue')
  const revenue = delivered.reduce((sum, order) => sum + order.total, 0)
  const units = new Map<string, number>()
  let profit = 0
  delivered.forEach(order => order.order_items.forEach(item => {
    units.set(item.product_id, (units.get(item.product_id) || 0) + item.quantity)
    const product = products.find(candidate => candidate.id === item.product_id)
    profit += (item.unit_price - (product?.cost || 0)) * item.quantity
  }))
  const topId = [...units.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const topProduct = products.find(product => product.id === topId)

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editing) setProducts(current => current.map(product => product.id === editing
      ? { ...product, name: name.trim(), price: Number(price), cost: Number(cost) } : product))
    else setProducts(current => [...current, {
      id: String(Date.now()), business_id: 'demo', name: name.trim(), price: Number(price), cost: Number(cost),
      status: 'disponivel', archived: false,
    }])
    setName(''); setPrice(''); setCost(''); setEditing(null); setNotice('Produto salvo na demonstração.')
  }

  function placeOrder() {
    const id = `demo-${String(orders.length + 1).padStart(3, '0')}`
    setOrders(current => [...current, {
      id, status: 'pendente', total: estimatedTotal, created_at: new Date().toISOString(),
      order_items: selected.map(product => ({
        id: `${id}-${product.id}`, product_id: product.id, quantity: quantities[product.id],
        unit_price: product.price, products: { name: product.name },
      })),
    }])
    setQuantities({}); setNotice(`Pedido ${id} lançado na demonstração.`)
  }

  function setStatus(id: string, status: OrderStatus) {
    setOrders(current => current.map(order => order.id === id ? { ...order, status } : order))
  }

  function soldOut(id: string) {
    setProducts(current => current.map(product => product.id === id ? { ...product, status: 'esgotado' } : product))
  }

  const tabs: { id: Screen; label: string }[] = [
    { id: 'auth', label: 'Entrada' }, { id: 'order', label: 'Comanda' },
    { id: 'kitchen', label: 'Cozinha' }, { id: 'products', label: 'Produtos' },
    { id: 'reports', label: 'Relatórios' },
  ]

  return <div className="min-h-screen">
    <header className="bg-slate-900 px-4 py-4 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold">Organiza+</h1><p className="text-sm">Meu negócio de exemplo</p></div>
        <span className="rounded border border-white px-3 py-2 text-sm">Prévia local · dados fictícios</span>
      </div>
    </header>
    <main className="mx-auto max-w-6xl p-4">
      <nav aria-label="Telas" className="mb-5 flex flex-wrap gap-2">
        {tabs.map(tab => <button key={tab.id} onClick={() => { setScreen(tab.id); setNotice('') }}
          className={`rounded px-4 py-2 ${screen === tab.id ? 'bg-blue-700 text-white' : 'bg-white'}`}>
          {tab.label}</button>)}
      </nav>
      {notice && <p role="status" className="mb-4 rounded bg-blue-100 p-3">{notice}</p>}

      {screen === 'auth' && <section className="mx-auto max-w-md space-y-4 rounded-lg bg-white p-6 shadow">
        <h2 className="text-xl font-semibold">Entrar</h2>
        <label className="block">E-mail<input type="email" placeholder="seu@email.com" /></label>
        <label className="block">Senha<input type="password" placeholder="••••••••" /></label>
        <button onClick={() => setScreen('order')} className="w-full rounded bg-blue-700 p-2 font-semibold text-white">Entrar na demonstração</button>
        <p className="text-sm text-slate-600">No modo real, esta tela usa o Supabase Auth.</p>
      </section>}

      {screen === 'products' && <section className="space-y-5">
        <form onSubmit={saveProduct} className="grid gap-3 rounded-lg bg-white p-4 shadow sm:grid-cols-4">
          <h2 className="sm:col-span-4 text-xl font-semibold">{editing ? 'Editar produto' : 'Novo produto'}</h2>
          <label>Nome<input required value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Preço (R$)<input required type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label>
          <label>Custo (R$)<input required type="number" min="0" step="0.01" value={cost} onChange={event => setCost(event.target.value)} /></label>
          <button className="self-end rounded bg-blue-700 px-4 py-2 text-white">Salvar</button>
        </form>
        {activeProducts.map(product => <article key={product.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 shadow">
          <div><strong>{product.name}</strong><p>{money(product.price)} · custo {money(product.cost)} · {product.status}</p></div>
          <div className="flex gap-2">
            <button className="rounded border px-3 py-1" onClick={() => {
              setEditing(product.id); setName(product.name); setPrice(String(product.price)); setCost(String(product.cost))
            }}>Editar</button>
            <button className="rounded border px-3 py-1" onClick={() => setProducts(current => current.map(item => item.id === product.id
              ? { ...item, status: item.status === 'disponivel' ? 'esgotado' : 'disponivel' } : item))}>
              {product.status === 'disponivel' ? 'Esgotar' : 'Disponibilizar'}</button>
            <button className="rounded border border-red-300 px-3 py-1 text-red-700" onClick={() => setProducts(current => current.map(item => item.id === product.id
              ? { ...item, archived: true } : item))}>Remover</button>
          </div>
        </article>)}
      </section>}

      {screen === 'order' && <section className="space-y-4">
        <h2 className="text-xl font-semibold">Comanda digital</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {available.map(product => <label key={product.id} className="flex items-center justify-between gap-4 rounded-lg bg-white p-4 shadow">
            <span><strong>{product.name}</strong><br />{money(product.price)}</span>
            <input aria-label={`Quantidade de ${product.name}`} className="!w-24" type="number" min="0" max="999" step="1"
              value={quantities[product.id] || 0} onChange={event => setQuantities(current => ({
                ...current, [product.id]: Math.max(0, Math.min(999, Number(event.target.value) || 0)),
              }))} />
          </label>)}
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="mb-3 font-semibold">Total estimado: {money(estimatedTotal)}</p>
          <button disabled={selected.length === 0} onClick={placeOrder} className="rounded bg-green-700 px-5 py-2 text-white">Lançar Pedido</button>
        </div>
      </section>}

      {screen === 'kitchen' && <section className="space-y-4">
        <h2 className="text-xl font-semibold">Cozinha · prévia local</h2>
        {orders.every(order => order.status === 'entregue') && <p>Nenhum pedido em aberto.</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          {orders.filter(order => order.status !== 'entregue').map(order => <article key={order.id} className="rounded-lg bg-white p-4 shadow">
            <div className="flex justify-between gap-2"><div><h3 className="font-bold">Pedido {order.id}</h3>
              <p className="text-sm text-slate-600">{new Date(order.created_at).toLocaleString('pt-BR')} · {order.status}</p></div>
              <strong>{money(order.total)}</strong></div>
            <ul className="my-4 space-y-2">{order.order_items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
              <span>{item.quantity} × {item.products?.name} · {money(item.unit_price)}</span>
              {products.find(product => product.id === item.product_id)?.status === 'disponivel' &&
                <button onClick={() => soldOut(item.product_id)} className="rounded border border-amber-500 px-2 py-1 text-sm">Esgotado</button>}
            </li>)}</ul>
            <div className="flex flex-wrap gap-2">
              {order.status === 'pendente' && <button onClick={() => setStatus(order.id, 'preparando')} className="rounded bg-blue-700 px-3 py-2 text-white">Preparando</button>}
              {(order.status === 'pendente' || order.status === 'preparando') && <button onClick={() => setStatus(order.id, 'pronto')}
                className="rounded bg-green-700 px-3 py-2 text-white">Pronto</button>}
              {order.status === 'pronto' && <button onClick={() => setStatus(order.id, 'entregue')}
                className="rounded bg-slate-800 px-3 py-2 text-white">Entregue</button>}
            </div>
          </article>)}
        </div>
      </section>}

      {screen === 'reports' && <section className="space-y-4">
        <div><h2 className="text-xl font-semibold">Relatórios</h2><p className="text-sm">Pedidos entregues · valores da demonstração</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-4 shadow"><p>Mais vendido</p><strong>{topProduct?.name || 'Nenhum'}</strong><p>{topId ? units.get(topId) : 0} unidades</p></div>
          <div className="rounded-lg bg-white p-4 shadow"><p>Faturamento</p><strong>{money(revenue)}</strong></div>
          <div className="rounded-lg bg-white p-4 shadow"><p>Lucro bruto</p><strong>{money(profit)}</strong></div>
          <div className="rounded-lg bg-white p-4 shadow"><p>Margem bruta</p><strong>{revenue ? (profit * 100 / revenue).toFixed(2) : '0.00'}%</strong></div>
        </div>
      </section>}
    </main>
  </div>
}
