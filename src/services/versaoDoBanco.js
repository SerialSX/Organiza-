import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { VERSAO_DO_BANCO } from '../lib/versaoDoBanco';

// Código novo com banco velho funciona pela metade sem dar erro (ex.: senha
// de 4 dígitos que o cliente não consegue digitar). Por isso o site confere a
// versão uma vez por visita e avisa a equipe.
let conferencia = null;

// true: banco atrás do código. false: em dia, ou não deu para saber (sem
// internet), e aí não assusta ninguém à toa.
export function bancoDesatualizado() {
  if (!isSupabaseConfigured) return Promise.resolve(false);
  conferencia ??= supabase.rpc('versao_do_banco').then(({ data, error }) => {
    // PGRST202: a função nem existe, ou seja, banco anterior a ela.
    if (error?.code === 'PGRST202' || error?.code === '42883') return true;
    if (error) {
      // Falha de rede: confere de novo na próxima tela.
      conferencia = null;
      return false;
    }
    return Number(data) < VERSAO_DO_BANCO;
  });
  return conferencia;
}
