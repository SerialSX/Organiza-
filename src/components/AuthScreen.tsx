import { useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { errorMessage } from '../types'

export default function AuthScreen() {
  const [register, setRegister] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (register) {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { business_name: businessName.trim() } },
        })
        if (error) throw error
        if (!data.session) setMessage('Cadastro enviado. Confirme seu e-mail antes de entrar.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return <main className="mx-auto flex min-h-screen max-w-md items-center p-4">
    <form onSubmit={submit} className="w-full space-y-4 rounded-lg bg-white p-6 shadow">
      <h1 className="text-2xl font-bold">Organiza+</h1>
      <h2 className="text-lg">{register ? 'Cadastrar negócio' : 'Entrar'}</h2>
      {register && <label className="block">Nome do negócio
        <input required maxLength={120} value={businessName} onChange={e => setBusinessName(e.target.value)} />
      </label>}
      <label className="block">E-mail
        <input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      </label>
      <label className="block">Senha
        <input required type="password" minLength={6} autoComplete={register ? 'new-password' : 'current-password'}
          value={password} onChange={e => setPassword(e.target.value)} />
      </label>
      {message && <p role="alert" className="rounded bg-slate-100 p-3 text-sm">{message}</p>}
      <button disabled={busy} className="w-full rounded bg-blue-700 p-2 font-semibold text-white">
        {busy ? 'Aguarde...' : register ? 'Criar conta' : 'Entrar'}
      </button>
      <button type="button" onClick={() => { setRegister(!register); setMessage('') }} className="w-full text-blue-700 underline">
        {register ? 'Já tenho conta' : 'Criar conta'}
      </button>
    </form>
  </main>
}
