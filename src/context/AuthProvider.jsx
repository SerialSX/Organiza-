import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { AuthContext } from './authContext';

const PERFIL_DEMO = {
  id: 'demo-usuario',
  nome: 'Demonstração',
  papel: 'admin',
  negocio_id: 'demo-negocio',
  negocio_nome: 'Meu negócio (demonstração)',
};

const ERROS_AUTH = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar. Veja sua caixa de entrada.',
  'User already registered': 'Já existe uma conta com este e-mail.',
};

function traduzirErro(error) {
  if (!error) return null;
  if (ERROS_AUTH[error.message]) return ERROS_AUTH[error.message];
  if (/password/i.test(error.message)) return 'A senha precisa ter pelo menos 6 caracteres.';
  return 'Algo deu errado. Tente de novo em instantes.';
}

async function buscarPerfil(userId) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, papel, negocio_id, negocios ( nome )')
    .eq('id', userId)
    .maybeSingle();
  // Erro de rede não pode virar "perfil inexistente"; quem chama decide.
  if (error) throw error;
  if (!data) return null;
  return { ...data, negocio_nome: data.negocios?.nome ?? '' };
}

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(isSupabaseConfigured ? null : PERFIL_DEMO);
  const [carregando, setCarregando] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    let ativo = true;

    async function aplicarSessao(novaSessao) {
      let novoPerfil = null;
      let falhou = false;
      if (novaSessao) {
        try {
          novoPerfil = await buscarPerfil(novaSessao.user.id);
        } catch {
          falhou = true;
        }
      }
      if (!ativo) return;
      setSessao(novaSessao);
      // Numa falha momentânea (ex.: renovação do token com internet ruim),
      // mantém o perfil que já estava carregado.
      if (!falhou) setPerfil(novoPerfil);
      setCarregando(false);
    }

    supabase.auth.getSession().then(({ data }) => aplicarSessao(data.session));

    const { data } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      // Adia para fora do callback, como a doc do supabase-js recomenda
      // para não travar o cliente ao fazer consultas aqui dentro.
      setTimeout(() => aplicarSessao(novaSessao), 0);
    });

    return () => {
      ativo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const entrar = useCallback(async (email, senha) => {
    if (!isSupabaseConfigured) return { erro: null };
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return { erro: traduzirErro(error) };
  }, []);

  const cadastrar = useCallback(async ({ nome, negocio, email, senha }) => {
    if (!isSupabaseConfigured) return { erro: null, precisaConfirmar: false };
    // O negócio e o perfil admin são criados por um trigger no banco a partir
    // destes metadados (ver supabase/migrations/).
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome, nome_negocio: negocio } },
    });
    return { erro: traduzirErro(error), precisaConfirmar: !error && !data.session };
  }, []);

  const sair = useCallback(async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
  }, []);

  const valor = useMemo(
    () => ({
      modoDemo: !isSupabaseConfigured,
      carregando,
      autenticado: isSupabaseConfigured ? Boolean(sessao) : true,
      perfil,
      entrar,
      cadastrar,
      sair,
    }),
    [carregando, sessao, perfil, entrar, cadastrar, sair],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
