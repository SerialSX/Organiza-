import { describe, expect, it } from 'vitest';
import { limparCodigo, traduzirErroRecuperacao, validarEmail, validarRedefinicao } from './recuperacaoSenha';

describe('limparCodigo', () => {
  it('aceita o código colado com espaços e traços', () => {
    expect(limparCodigo(' 123 456 ')).toBe('123456');
    expect(limparCodigo('12-34-56')).toBe('123456');
  });

  it('corta em 6 dígitos e descarta letras', () => {
    expect(limparCodigo('1234567')).toBe('123456');
    expect(limparCodigo('a1b2')).toBe('12');
  });
});

describe('validarEmail', () => {
  it('pede o e-mail e recusa formato inválido', () => {
    expect(validarEmail('  ')).toBe('Digite o e-mail da sua conta.');
    expect(validarEmail('ana@')).toBe('Digite um e-mail válido.');
    expect(validarEmail(' ana@x.com ')).toBeNull();
  });
});

describe('validarRedefinicao', () => {
  const valido = { email: 'ana@x.com', codigo: '123456', senha: 'segredo', confirmarSenha: 'segredo', codigoAceito: false };

  it('aceita dados completos', () => {
    expect(validarRedefinicao(valido)).toBeNull();
  });

  it('exige os 6 dígitos do código', () => {
    expect(validarRedefinicao({ ...valido, codigo: '12345' })).toBe('Digite os 6 dígitos do código.');
  });

  it('exige senha mínima e confirmação igual', () => {
    expect(validarRedefinicao({ ...valido, senha: '123', confirmarSenha: '123' })).toBe(
      'A senha precisa ter pelo menos 6 caracteres.',
    );
    expect(validarRedefinicao({ ...valido, confirmarSenha: 'outra' })).toBe('As senhas não coincidem.');
  });

  it('com o código já aceito, confere só a senha', () => {
    expect(validarRedefinicao({ ...valido, email: '', codigo: '', codigoAceito: true })).toBeNull();
  });
});

describe('traduzirErroRecuperacao', () => {
  it('sem erro não há mensagem', () => {
    expect(traduzirErroRecuperacao(null)).toBeNull();
  });

  it('traduz os códigos do Supabase Auth', () => {
    expect(traduzirErroRecuperacao({ code: 'otp_expired', status: 403 })).toBe('Código inválido ou expirado. Peça um novo.');
    expect(traduzirErroRecuperacao({ code: 'same_password', status: 422 })).toBe(
      'A nova senha precisa ser diferente da antiga.',
    );
    expect(traduzirErroRecuperacao({ code: 'over_email_send_rate_limit', status: 429 })).toBe(
      'Espere um minuto antes de pedir outro código.',
    );
  });

  it('trata limite sem código conhecido e falta de internet', () => {
    expect(traduzirErroRecuperacao({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(traduzirErroRecuperacao({ name: 'AuthRetryableFetchError', status: 0 })).toMatch(/Sem conexão/);
    expect(traduzirErroRecuperacao({ status: 500, message: 'Error sending recovery email' })).toBe(
      'Algo deu errado. Tente de novo em instantes.',
    );
  });
});
