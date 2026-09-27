import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AuthScreen from './components/AuthScreen'
import ProductsScreen from './components/ProductsScreen'
import OrderScreen from './components/OrderScreen'
import KitchenScreen from './components/KitchenScreen'
import ReportsScreen from './components/ReportsScreen'
import PreviewApp from './PreviewApp'
import { supabase } from './supabase'
import type { Business, Product } from './types'

type Screen = 'products' | 'order' | 'kitchen' | 'reports'

export default function App() {
  return import.meta.env.VITE_DEMO_MODE === 'true' ? <PreviewApp /> : <ConnectedApp />
}

function ConnectedApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [business, setBusiness] = useState<Business | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [screen, setScreen] = useState<Screen>('order')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message)
      setSession(data.session); setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession); setAuthReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setBusiness(null); setProducts([]); return }
    let active = true
    void supabase.from('businesses').select('id,name').eq('owner_id', session.user.id).single()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setMessage(`Não foi possível carregar o negócio: ${error.message}`)
        else { setBusiness(data as Business); setMessage('') }
      })
    return () => { active = false }
  }, [session?.user.id])

  const reloadProducts = useCallback(async () => {
    if (!business) return
    const { data, error } = await supabase.from('products').select('*')
      .eq('business_id', business.id).eq('archived', false).order('name')
    if (error) setMessage(error.message)
    else setProducts((data || []) as Product[])
  }, [business])

  useEffect(() => {
    if (!business) return
    void reloadProducts()
    const channel = supabase.channel(`catalog-${business.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'products', filter: `business_id=eq.${business.id}`,
      }, () => { void reloadProducts() })
      .subscribe(status => { if (status === 'SUBSCRIBED') void reloadProducts() })
    return () => { void supabase.removeChannel(channel) }
  }, [business, reloadProducts])

  if (!authReady) return <p className="p-6">Carregando sessão...</p>
  if (!session) return <AuthScreen />
  if (!business) return <main className="p-6"><p>Carregando negócio...</p>
    {message && <p role="alert">{message}</p>}
    <button onClick={() => void supabase.auth.signOut()} className="mt-3 underline">Sair</button></main>

  const tabs: { id: Screen; label: string }[] = [
    { id: 'order', label: 'Comanda' }, { id: 'kitchen', label: 'Cozinha' },
    { id: 'products', label: 'Produtos' }, { id: 'reports', label: 'Relatórios' },
  ]

  return <div className="min-h-screen">
    <header className="bg-slate-900 px-4 py-4 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold">Organiza+</h1><p className="text-sm">{business.name}</p></div>
        <button onClick={() => void supabase.auth.signOut()} className="rounded border border-white px-3 py-2">Sair</button>
      </div>
    </header>
    <main className="mx-auto max-w-6xl p-4">
      <nav aria-label="Telas" className="mb-5 flex flex-wrap gap-2">
        {tabs.map(tab => <button key={tab.id} onClick={() => setScreen(tab.id)}
          className={`rounded px-4 py-2 ${screen === tab.id ? 'bg-blue-700 text-white' : 'bg-white'}`}>
          {tab.label}</button>)}
      </nav>
      {message && <p role="alert" className="mb-4 rounded bg-amber-100 p-3">{message}</p>}
      {screen === 'products' && <ProductsScreen businessId={business.id} products={products} reload={reloadProducts} />}
      {screen === 'order' && <OrderScreen products={products} />}
      {screen === 'kitchen' && <KitchenScreen businessId={business.id} products={products} reloadProducts={reloadProducts} />}
      {screen === 'reports' && <ReportsScreen />}
    </main>
  </div>
}
