import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Sem Supabase, o app roda em modo demonstração (dados só no navegador).
// Em produção isso só vale se for ligado de propósito: esquecer as variáveis
// na Vercel faria os empreendedores usarem um sistema que não salva nada.
const demoPermitido = import.meta.env.DEV || import.meta.env.VITE_MODO_DEMO === 'true';
export const configuracaoAusente = !isSupabaseConfigured && !demoPermitido;

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;
