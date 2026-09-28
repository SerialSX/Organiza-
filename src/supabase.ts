import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const demo = import.meta.env.VITE_DEMO_MODE === 'true'

if ((!url || !key) && !demo) {
  throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local')
}

// O modo demo usa uma URL inerte; seus componentes não fazem chamadas ao Supabase.
export const supabase = createClient(url || 'https://demo.invalid', key || 'preview-only')
