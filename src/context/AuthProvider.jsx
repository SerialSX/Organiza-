import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { lerDemo, salvarDemo, limparDemo, MESAS_DEMO } from '../services/demoStore';
import { AuthContext } from './authContext';
import { traduzirErroRecuperacao } from '../lib/recuperacaoSenha';
import { definirViradaDoDia, viradaMudaODia } from '../lib/formatadores';
import { buscarPerfil } from '../services/perfil';

const PERFIL_DEMO = {
  id: 'demo-usuario',
  nome: 'Demonstração',
  email: 'demonstracao@exemplo.com',
  papel: 'admin',
  negocio_id: 'demo-negocio',
  negocio_nome: 'Meu negócio (demonstração)',
  virada_do_dia: 5,
  usa_tela_cozinha: true,
  // A demonstração já começa respondida; o teste das perguntas de
  // boas-vindas apaga este valor para ver a pessoa respondendo.
  modo_atendimento: 'balcao_e_mesa',
  ...MESAS_DEMO,
};

function perfilDemo() {
  const perfil = { ...PERFIL_DEMO, ...lerDemo().perfil };
  // Já na primeira tela, antes de qualquer efeito rodar.
  definirViradaDoDia(perfil.virada_do_dia);
  return perfil;
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

// Mesmo texto do configurar_operacao no banco.
const ERRO_VIRADA_NO_TURNO =
  'Agora não dá para mudar a hora: o dia de trabalho viraria no meio do turno e as senhas se repetiriam. Mude depois das 8h da manhã.';

function traduzirErro(error) {
  if (!error) return null;
  if (error.code === 'P0001') return error.message;
  return ERROS_AUTH.find(([padrao]) => padrao.test(error.message ?? ''))?.[1] ?? 'Algo deu errado. Tente de novo em instantes.';
}

function enderecoDoApp(caminho) {
  return `${window.location.origin}${caminho}`;
}

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(() => (isSupabaseConfigured ? null : perfilDemo()));
  const [carregando, setCarregando] = useState(isSupabaseConfigured);
  const [semConexao, setSemConexao] = useState(false);

  // Todas as telas contam o "dia" a partir da virada do negócio.
  useEffect(() => {
    definirViradaDoDia(perfil?.virada_do_dia ?? 0);
  }, [perfil?.virada_do_dia]);

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
  // senhaAtual: na troca pela Minha conta, vai junto para o Supabase conferir
  // também (com "Secure password change" ligado no painel, ele exige). Na
  // recuperação por código não existe senha atual.
  const trocarSenha = useCallback(async (senha, senhaAtual = null) => {
    if (!isSupabaseConfigured) return { erro: null };
    const { error } = await supabase.auth.updateUser(senhaAtual ? { password: senha, current_password: senhaAtual } : { password: senha });
    return { erro: traduzirErroRecuperacao(error) };
  }, []);

  // Confere a senha antes de algo que não dá para desfazer. Todos os aparelhos
  // do negócio usam a mesma conta: sem isso, qualquer um com o celular do
  // balcão na mão poderia excluir o negócio ou trocar a senha do dono.
  const confirmarSenhaAtual = useCallback(
    async (senha) => {
      if (!isSupabaseConfigured) return { erro: null };
      if (!senha) return { erro: 'Digite sua senha atual.' };
      const { error } = await supabase.auth.signInWithPassword({ email: perfil?.email ?? '', password: senha });
      if (!error) return { erro: null };
      return { erro: /invalid login credentials/i.test(error.message ?? '') ? 'Senha atual incorreta.' : traduzirErro(error) };
    },
    [perfil?.email],
  );

  // Só neste aparelho: o tablet da cozinha continua conectado.
  const sair = useCallback(async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut({ scope: 'local' });
  }, []);

  // Hora em que o dia vira e se a cozinha tem tela própria (só o dono).
  const configurarOperacao = useCallback(async ({ viradaDoDia, usaTelaCozinha }) => {
    if (!isSupabaseConfigured) {
      const db = lerDemo();
      if (viradaMudaODia(viradaDoDia, perfilDemo().virada_do_dia)) return { erro: ERRO_VIRADA_NO_TURNO };
      salvarDemo({ ...db, perfil: { ...db.perfil, virada_do_dia: viradaDoDia, usa_tela_cozinha: usaTelaCozinha } });
      setPerfil(perfilDemo());
      return { erro: null };
    }
    const { error } = await supabase.rpc('configurar_operacao', {
      p_virada_do_dia: viradaDoDia,
      p_usa_tela_cozinha: usaTelaCozinha,
    });
    if (error) return { erro: traduzirErro(error) };
    setPerfil((p) => ({ ...p, virada_do_dia: viradaDoDia, usa_tela_cozinha: usaTelaCozinha }));
    return { erro: null };
  }, []);

  // Respostas das perguntas de boas-vindas (só o dono). Também usado em
  // Minha conta para mudar depois.
  const configurarAtendimento = useCallback(async ({ modo, usaTelaCozinha }) => {
    if (!isSupabaseConfigured) {
      const db = lerDemo();
      salvarDemo({ ...db, perfil: { ...db.perfil, modo_atendimento: modo, usa_tela_cozinha: usaTelaCozinha } });
      setPerfil(perfilDemo());
      return { erro: null };
    }
    const { error } = await supabase.rpc('configurar_atendimento', { p_modo: modo, p_usa_tela_cozinha: usaTelaCozinha });
    if (error) return { erro: traduzirErro(error) };
    setPerfil((p) => ({ ...p, modo_atendimento: modo, usa_tela_cozinha: usaTelaCozinha }));
    return { erro: null };
  }, []);

  // Quantas mesas o negócio tem e a taxa de serviço em % (0: não cobra). Só o dono.
  const configurarMesas = useCallback(async ({ quantidade, taxaServico }) => {
    if (!isSupabaseConfigured) {
      const db = lerDemo();
      salvarDemo({ ...db, perfil: { ...db.perfil, quantidade_mesas: quantidade, taxa_servico: taxaServico } });
      setPerfil(perfilDemo());
      return { erro: null };
    }
    const { error } = await supabase.rpc('configurar_mesas', { p_quantidade: quantidade, p_taxa_servico: taxaServico });
    if (error) return { erro: traduzirErro(error) };
    setPerfil((p) => ({ ...p, quantidade_mesas: quantidade, taxa_servico: taxaServico }));
    return { erro: null };
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
      confirmarSenhaAtual,
      configurarOperacao,
      configurarAtendimento,
      configurarMesas,
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
      confirmarSenhaAtual,
      configurarOperacao,
      configurarAtendimento,
      configurarMesas,
      sair,
      sairDeTodosOsAparelhos,
      excluirConta,
    ],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
