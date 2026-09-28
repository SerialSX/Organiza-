import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { money, type Report } from '../types'

export default function ReportsScreen() {
  const [report, setReport] = useState<Report | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true); setMessage('')
    const { data, error } = await supabase.rpc('business_report')
    if (error) setMessage(error.message)
    else setReport(data?.[0] as Report || null)
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  return <section className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Relatórios</h2><p className="text-sm">Pedidos entregues · valores históricos</p></div>
      <button onClick={() => void load()} disabled={loading} className="rounded border bg-white px-3 py-2">Atualizar</button>
    </div>
    {message && <p role="alert">{message}</p>}
    {report && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg bg-white p-4 shadow"><p>Mais vendido</p><strong>{report.top_product || 'Nenhum'}</strong>
        <p>{report.units_sold} unidades</p></div>
      <div className="rounded-lg bg-white p-4 shadow"><p>Faturamento</p><strong>{money(report.revenue)}</strong></div>
      <div className="rounded-lg bg-white p-4 shadow"><p>Lucro bruto</p><strong>{money(report.gross_profit)}</strong></div>
      <div className="rounded-lg bg-white p-4 shadow"><p>Margem bruta</p><strong>{Number(report.margin_percent).toFixed(2)}%</strong></div>
    </div>}
  </section>
}
