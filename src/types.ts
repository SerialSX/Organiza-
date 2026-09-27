export type Product = {
  id: string
  business_id: string
  name: string
  price: number
  cost: number
  status: 'disponivel' | 'esgotado'
  archived: boolean
}

export type Business = { id: string; name: string }

export type OrderStatus = 'pendente' | 'preparando' | 'pronto' | 'entregue'

export type OrderItem = {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  products: { name: string } | null
}

export type Order = {
  id: string
  status: OrderStatus
  total: number
  created_at: string
  order_items: OrderItem[]
}

export type Report = {
  top_product: string | null
  units_sold: number
  revenue: number
  gross_profit: number
  margin_percent: number
}

export const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
