import { beforeEach, describe, expect, it, vi } from 'vitest';

// Respostas do Supabase, uma por consulta, na ordem.
const respostas = [];
const selects = [];

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: (campos) => {
        selects.push(campos);
        return { eq: () => ({ maybeSingle: async () => respostas.shift() }) };
      },
    }),
  },
}));

const { buscarPerfil } = await import('./perfil');
const usuario = { id: 'u1', email: 'ana@exemplo.com' };
const linha = { id: 'u1', nome: 'Ana', papel: 'admin', negocio_id: 'n1' };

beforeEach(() => {
  respostas.length = 0;
  selects.length = 0;
});

describe('perfil de quem entrou', () => {
  it('lê o negócio com a virada e a tela da cozinha', async () => {
    respostas.push({ data: { ...linha, negocios: { nome: 'Lanche da Ana', virada_do_dia: 5, usa_tela_cozinha: false } }, error: null });
    const perfil = await buscarPerfil(usuario);
    expect(perfil).toMatchObject({ negocio_nome: 'Lanche da Ana', virada_do_dia: 5, usa_tela_cozinha: false, email: 'ana@exemplo.com' });
    expect(selects).toHaveLength(1);
  });

  it('banco sem a migração: entra mesmo assim, em vez de travar em "Sem conexão"', async () => {
    respostas.push({ data: null, error: { code: '42703', message: 'column negocios_1.virada_do_dia does not exist' } });
    respostas.push({ data: { ...linha, negocios: { nome: 'Lanche da Ana' } }, error: null });
    const perfil = await buscarPerfil(usuario);
    expect(perfil).toMatchObject({ negocio_nome: 'Lanche da Ana', virada_do_dia: 0, usa_tela_cozinha: true });
    expect(selects[1]).toContain('negocios ( nome )');
  });

  it('falha de rede continua sendo erro (não vira "conta sem negócio")', async () => {
    respostas.push({ data: null, error: { code: '', message: 'Failed to fetch' } });
    await expect(buscarPerfil(usuario)).rejects.toMatchObject({ message: 'Failed to fetch' });
    expect(selects).toHaveLength(1);
  });
});
