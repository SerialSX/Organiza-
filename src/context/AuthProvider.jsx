import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { lerDemo, salvarDemo, limparDemo } from '../services/demoStore';
import { AuthContext } from './authContext';
import { traduzirErroRecuperacao } from '../lib/recuperacaoSenha';

const PERFIL_DEMO = {
  id: 'demo-usuario',
  nome: 'Demonstração',
  email: 'demonstracao@exemplo.com',
  papel: 'admin',
  negocio_id: 'demo-negocio',
  negocio_nome: 'Meu negócio (demonstração)',
};

function perfilDemo() {
  return { ...PERFIL_DEMO, ...lerDemo().perfil };
}

// Mensagens do Supabase Auth em português, sempre dizendo o que fazer.
const ERROS_AUTH = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar. Veja sua caixa de entrada.'],
  [/already registered/i, 'Já existe uma conta com este e-mail. Entre ou use "Esqueci minha senha".'],
  [/different from the old password/i, 'A senha nova precisa ser diferente da atual.'],
  [/(only request this after|rate limit|too many requests)/i, 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'],
  [/(session missing|expired|invalid.*token)/i, 'Este link venceu ou já foi usado. Peça um novo.'],
  [/password/i, 'A senha precisa ter pelo menos 6 caracteres.'],
  [/(fetch|network)/i, 'Sem conexão. Confira a internet e tente de novo.'],
];

function traduzirErro(error) {
  if (!error) return null;
  if (error.code === 'P0001') return error.message;
  return ERROS_AUTH.find(([padrao]) => padrao.test(error.message ?? ''))?.[1] ?? 'Algo deu errado. Tente de novo em instantes.';
}

async function buscarPerfil(usuario) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, papel, negocio_id, negocios ( nome )')
    .eq('id', usuario.id)
    .maybeSingle();
  // Erro de rede não pode virar "perfil inexistente"; quem chama decide.
  if (error) throw error;
  if (!data) return null;
  return { ...data, email: usuario.email, negocio_nome: data.negocios?.nome ?? '' };
}

function enderecoDoApp(caminho) {
  return `${window.location.origin}${caminho}`;
}

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(() => (isSupabaseConfigured ? null : perfilDemo()));
  const [carregando, setCarregando] = useState(isSupabaseConfigured);
  const [semConexao, setSemConexao] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    let ativo = true;

    async function aplicarSessao(novaSessao) {
      let novoPerfil = null;
      let falhou = false;
      if (novaSessao) {
        try {
          novoPerfil = await buscarPerfil(novaSessao.user);
        } catch {
          falhou = true;
        }
      }
      if (!ativo) return;
      setSessao(novaSessao);
      // Numa falha momentânea (ex.: renovação do token com internet ruim),
      // mantém o perfil que já estava carregado.
      if (!falhou) setPerfil(novoPerfil);
      setSemConexao(falhou);
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
    // destes metadados (ver supabase/schema.sql).
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome, nome_negocio: negocio }, emailRedirectTo: enderecoDoApp('/home') },
    });
    return { erro: traduzirErro(error), precisaConfirmar: !error && !data.session };
  }, []);

  const atualizarDados = useCallback(
    async ({ nome, nomeNegocio }) => {
      if (!isSupabaseConfigured) {
        const db = lerDemo();
        salvarDemo({ ...db, perfil: { ...db.perfil, nome, negocio_nome: nomeNegocio } });
        setPerfil(perfilDemo());
        return { erro: null };
      }
      const { error } = await supabase.rpc('atualizar_meus_dados', { p_nome: nome, p_nome_negocio: nomeNegocio });
      if (error) return { erro: traduzirErro(error) };
      setPerfil((p) => ({ ...p, nome: nome.trim(), negocio_nome: nomeNegocio ? nomeNegocio.trim() : p.negocio_nome }));
      return { erro: null };
    },
    [],
  );

  // Recuperação de senha por código: o Supabase manda o e-mail com o código
  // (modelo "Reset Password" usando {{ .Token }}) e responde igual para
  // e-mail com ou sem conta.
  const pedirCodigoSenha = useCallback(async (email) => {
    if (!isSupabaseConfigured) return { erro: null };
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { erro: traduzirErroRecuperacao(error) };
  }, []);

  // Aceitar o código já abre a sessão da conta; a senha nova vem em seguida.
  const confirmarCodigoSenha = useCallback(async (email, codigo) => {
    if (!isSupabaseConfigured) return { erro: null };
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'recovery' });
    return { erro: traduzirErroRecuperacao(error) };
  }, []);

  // Serve tanto para a recuperação por código quanto para "Minha conta".
  const trocarSenha = useCallback(async (senha) => {
    if (!isSupabaseConfigured) return { erro: null };
    const { error } = await supabase.auth.updateUser({ password: senha });
    return { erro: traduzirErroRecuperacao(error) };
  }, []);

  const sair = useCallback(async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
  }, []);

  // Para quando um aparelho foi perdido ou um funcionário saiu com a senha.
  const sairDeTodosOsAparelhos = useCallback(async () => {
    if (!isSupabaseConfigured) return { erro: null };
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    return { erro: traduzirErro(error) };
  }, []);

  const excluirConta = useCallback(async () => {
    if (!isSupabaseConfigured) {
      limparDemo();
      setPerfil(perfilDemo());
      return { erro: null };
    }
    const { error } = await supabase.rpc('excluir_minha_conta');
    if (error) {
      return { erro: error.code === 'P0001' ? error.message : 'Não foi possível excluir a conta. Tente de novo.' };
    }
    // O usuário já não existe no Auth: só limpa a sessão guardada neste aparelho.
    await supabase.auth.signOut({ scope: 'local' });
    return { erro: null };
  }, []);

  const valor = useMemo(
    () => ({
      modoDemo: !isSupabaseConfigured,
      carregando,
      semConexao,
      autenticado: isSupabaseConfigured ? Boolean(sessao) : true,
      perfil,
      entrar,
      cadastrar,
      atualizarDados,
      pedirCodigoSenha,
      confirmarCodigoSenha,
      trocarSenha,
      sair,
      sairDeTodosOsAparelhos,
      excluirConta,
    }),
    [
      carregando,
      semConexao,
      sessao,
      perfil,
      entrar,
      cadastrar,
      atualizarDados,
      pedirCodigoSenha,
      confirmarCodigoSenha,
      trocarSenha,
      sair,
      sairDeTodosOsAparelhos,
      excluirConta,
    ],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
