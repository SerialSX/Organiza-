import { describe, expect, it } from 'vitest';
import { formatarMoeda } from './formatadores';
import { conferirPromocao, precoEmPromocao, promocaoVale, seloDaPromocao, textoDoHorario, textoDosDias } from './promocoes';

// 10/11/2026 é terça. Fortaleza: UTC-3 o ano todo.
const em = (dia, hora) => new Date(`2026-11-${dia}T${hora}:00-03:00`);
const promo = (extra) => ({ id: 'p', nome: 'Happy hour', dias: [2], hora_inicio: '17:00', hora_fim: '19:00', ativa: true, itens: [], ...extra });

describe('promocaoVale', () => {
  it('no dia e no horário; o fim não entra', () => {
    expect(promocaoVale(promo(), em(10, '17:00'))).toBe(true);
    expect(promocaoVale(promo(), em(10, '18:59'))).toBe(true);
    expect(promocaoVale(promo(), em(10, '19:00'))).toBe(false);
    expect(promocaoVale(promo(), em(10, '16:59'))).toBe(false);
    expect(promocaoVale(promo(), em(11, '17:30'))).toBe(false);
  });

  it('passando da meia-noite: a madrugada ainda é o dia de trabalho anterior', () => {
    const noite = promo({ dias: [5], hora_inicio: '22:00', hora_fim: '02:00' });
    expect(promocaoVale(noite, em(13, '23:00'))).toBe(true); // sexta
    expect(promocaoVale(noite, em(14, '01:00'))).toBe(true); // madrugada de sábado = sexta
    expect(promocaoVale(noite, em(14, '03:00'))).toBe(false);
    expect(promocaoVale(noite, em(14, '23:00'))).toBe(false); // sábado
  });

  it('o dia todo vale até a virada das 5h; pausada não vale', () => {
    const terca = promo({ hora_inicio: null, hora_fim: null });
    expect(promocaoVale(terca, em(10, '06:00'))).toBe(true);
    expect(promocaoVale(terca, em(11, '04:59'))).toBe(true);
    expect(promocaoVale(terca, em(11, '05:00'))).toBe(false);
    expect(promocaoVale({ ...terca, ativa: false }, em(10, '12:00'))).toBe(false);
  });
});

describe('precoEmPromocao', () => {
  const x = { produtoId: 'x', tamanhoId: null };
  const comItens = (id, preco, extra = {}) => promo({ id, hora_inicio: null, hora_fim: null, itens: [{ produto_id: 'x', tamanho_id: null, combo_id: null, preco }], ...extra });

  it('a mais barata das que valem agora', () => {
    const r = precoEmPromocao([comItens('a', 15), comItens('b', 14)], x, 18, em(10, '12:00'));
    expect(r).toMatchObject({ preco: 14, promocao: { id: 'b' } });
  });

  it('só quando fica mais barato que o normal; e para o alvo certo', () => {
    expect(precoEmPromocao([comItens('a', 18)], x, 18, em(10, '12:00'))).toBeNull();
    expect(precoEmPromocao([comItens('a', 15)], { produtoId: 'x', tamanhoId: 'g' }, 18, em(10, '12:00'))).toBeNull();
    expect(precoEmPromocao([comItens('a', 15)], x, 18, em(11, '12:00'))).toBeNull();
    const doCombo = promo({ hora_inicio: null, itens: [{ produto_id: null, tamanho_id: null, combo_id: 'c', preco: 25 }] });
    expect(precoEmPromocao([doCombo], { comboId: 'c' }, 30, em(10, '12:00'))).toMatchObject({ preco: 25 });
  });
});

describe('textos', () => {
  it('selo e horário', () => {
    expect(seloDaPromocao(promo())).toBe('Promoção até 19h');
    expect(seloDaPromocao(promo({ hora_inicio: null }))).toBe('Promoção hoje');
    expect(textoDoHorario(promo({ dias: [1, 2, 3, 4, 5], hora_fim: '19:30' }))).toBe('De segunda a sexta, das 17h às 19h30');
    expect(textoDoHorario(promo({ hora_inicio: null }))).toBe('Terça, o dia todo');
    expect(textoDosDias([1, 3, 5])).toBe('Segunda, quarta e sexta');
    expect(textoDosDias([0, 1, 2, 3, 4, 5, 6])).toBe('Todo dia');
  });
});

describe('conferirPromocao', () => {
  const certa = { nome: ' Happy  hour ', dias: [2], diaTodo: false, inicio: '17:00', fim: '19:00', itens: [{ nome: 'X-Burguer', normal: 18, preco: 15 }] };

  it('confere com os textos do banco', () => {
    expect(conferirPromocao(certa)).toBe('Happy hour');
    expect(() => conferirPromocao({ ...certa, dias: [] })).toThrow('Escolha pelo menos um dia da semana.');
    expect(() => conferirPromocao({ ...certa, inicio: '04:00' })).toThrow('A promoção precisa começar a partir das 5h. Antes disso ainda é o dia anterior.');
    expect(() => conferirPromocao({ ...certa, inicio: '22:00', fim: '06:00' })).toThrow('Passando da meia-noite, a promoção pode ir até as 5h.');
    expect(conferirPromocao({ ...certa, inicio: '22:00', fim: '02:00' })).toBe('Happy hour');
    expect(() => conferirPromocao({ ...certa, fim: '17:00' })).toThrow('A hora de terminar precisa ser diferente');
    expect(() => conferirPromocao({ ...certa, itens: [{ nome: 'X-Burguer', normal: 18, preco: 18 }] })).toThrow(
      `O preço de X-Burguer na promoção precisa ser menor que o normal (${formatarMoeda(18)}).`,
    );
    expect(() => conferirPromocao({ ...certa, itens: [{ nome: 'X-Burguer', normal: 18, preco: NaN }] })).toThrow('Digite o preço de X-Burguer na promoção.');
    expect(conferirPromocao({ ...certa, diaTodo: true, inicio: '', fim: '' })).toBe('Happy hour');
  });
});
