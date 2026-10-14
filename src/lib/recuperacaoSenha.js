// Regras da recuperação de senha por código de 6 dígitos enviado por e-mail.
// Quem gera, guarda e confere o código é o Supabase Auth (modelo de e-mail
// "Reset Password" com {{ .Token }}); aqui ficam só validação e mensagens.
export const TAMANHO_CODIGO = 6;
const SENHA_MINIMA = 6;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Só dígitos, até 6: colar o código do e-mail com espaços também funciona.
export function limparCodigo(valor) {
  return valor.replace(/\D/g, '').slice(0, TAMANHO_CODIGO);
}

export function validarEmail(email) {
  if (!email.trim()) return 'Digite o e-mail da sua conta.';
  if (!EMAIL_VALIDO.test(email.trim())) return 'Digite um e-mail válido.';
  return null;
}

// Depois que o código é aceito, só falta a senha: e-mail e código não são
// conferidos de novo.
export function validarRedefinicao({ email, codigo, senha, confirmarSenha, codigoAceito }) {
  if (!codigoAceito) {
    const erroEmail = validarEmail(email);
    if (erroEmail) return erroEmail;
    if (codigo.length !== TAMANHO_CODIGO) return 'Digite os 6 dígitos do código.';
  }
  if (senha.length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (senha !== confirmarSenha) return 'As senhas não coincidem.';
  return null;
}

// Códigos de erro do Supabase Auth. Código errado, vencido ou de e-mail sem
// conta dão todos "otp_expired", então a resposta não revela quem tem conta.
const MENSAGENS = {
  otp_expired: 'Código inválido ou expirado. Peça um novo.',
  over_email_send_rate_limit: 'Espere um minuto antes de pedir outro código.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
  same_password: 'A nova senha precisa ser diferente da antiga.',
  weak_password: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`,
  email_address_invalid: 'Digite um e-mail válido.',
};

export function traduzirErroRecuperacao(error) {
  if (!error) return null;
  if (MENSAGENS[error.code]) return MENSAGENS[error.code];
  if (error.status === 429) return MENSAGENS.over_request_rate_limit;
  if (error.name === 'AuthRetryableFetchError') return 'Sem conexão. Confira a internet e tente de novo.';
  return 'Algo deu errado. Tente de novo em instantes.';
}
