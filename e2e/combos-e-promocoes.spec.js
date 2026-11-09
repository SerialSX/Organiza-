import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { enviar } from './ajuda';

// Combos (preço fixo, partes fixas e à escolha) e promoções por dia e horário:
// o cadastro em Produtos, a venda em Pedidos, a cozinha e o relatório.

async function semProblemasDeAcessibilidade(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

const cartao = (page, nome) => page.getByRole('listitem').filter({ has: page.getByText(nome, { exact: true }) });

async function montarHamburgueria(page) {
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Hamburgueria' }).click();
  await expect(page.getByText('X-Burguer', { exact: true })).toBeVisible();
}

// Combo X: X-Burguer e Batata já vêm; bebida à escolha (suco custa R$ 2 a mais).
async function cadastrarCombo(page) {
  await page.goto('/produtos?aba=combos');
  await page.getByRole('button', { name: 'Montar o primeiro combo' }).click();
  const form = page.getByRole('form', { name: 'Novo combo' });
  await form.getByLabel('Nome', { exact: true }).fill('Combo X');
  await form.getByLabel('Preço do combo (R$)').fill('30');
  await form.getByLabel('Parte 1, produto').selectOption({ label: 'X-Burguer (R$ 18,00)' });
  await form.getByLabel('Parte 2, produto').selectOption({ label: 'Batata frita (R$ 15,00)' });
  await form.getByRole('button', { name: 'Mais uma parte' }).click();
  await form.getByLabel('Parte 3, produto').selectOption({ label: 'Refrigerante lata (R$ 6,00)' });
  const terceira = form.getByRole('group', { name: /^Parte 3/ });
  await terceira.getByRole('button', { name: 'Deixar o cliente escolher' }).click();
  await terceira.getByLabel('Parte 3, nome da parte (opcional)').fill('Bebida');
  await terceira.getByLabel('Parte 3, opção 2', { exact: true }).selectOption({ label: 'Suco natural (R$ 8,00)' });
  await terceira.getByLabel('Parte 3, opção 2, a mais (R$, opcional)').fill('2');
  // Separado: 18 + 15 + 6 (a bebida mais barata).
  await expect(form.getByText('Separado sai por R$ 39,00. O cliente economiza R$ 9,00.')).toBeVisible();
  return form;
}

test('combo: cadastra com bebida à escolha, vende com acréscimo e a cozinha vê o combo com as partes', async ({ page, context }) => {
  await montarHamburgueria(page);
  const form = await cadastrarCombo(page);
  await semProblemasDeAcessibilidade(page);
  await form.getByRole('button', { name: 'Salvar combo' }).click();
  await expect(page.getByText('Combo salvo. Ele já aparece em Pedidos.')).toBeVisible();
  await expect(cartao(page, 'Combo X')).toContainText('X-Burguer, Batata frita, Bebida à escolha');
  await expect(cartao(page, 'Combo X')).toContainText('O cliente economiza R$ 9,00');

  await page.goto('/pedidos');
  await expect(page.getByRole('heading', { name: 'Combos' })).toBeVisible();
  await page.getByRole('button', { name: 'Montar Combo X, R$ 30,00' }).click();
  const janela = page.getByRole('dialog', { name: 'Combo X' });
  await expect(janela.getByText('X-Burguer, Batata frita')).toBeVisible();
  await janela.getByRole('button', { name: /^Adicionar Combo X/ }).click();
  await expect(janela.getByText('Escolha: Bebida.')).toBeVisible();
  await janela.getByRole('button', { name: 'Suco natural, mais R$ 2,00' }).click();
  await semProblemasDeAcessibilidade(page);
  await janela.getByRole('button', { name: 'Adicionar Combo X, R$ 32,00' }).click();
  await expect(janela).toHaveCount(0);

  const carrinho = page.getByRole('complementary', { name: 'Pedido' });
  await expect(carrinho.getByText('Combo X', { exact: true })).toBeVisible();
  await expect(carrinho.getByText('X-Burguer, Batata frita, Suco natural')).toBeVisible();
  await expect(carrinho).toContainText('R$ 32,00');
  await expect(page.getByRole('button', { name: 'Montar Combo X, R$ 30,00, 1 no pedido' })).toBeVisible();
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible();

  const cozinha = await context.newPage();
  await cozinha.goto('/cozinha');
  await expect(cozinha.getByText('Combo X', { exact: true }).first()).toBeVisible();
  await expect(cozinha.getByText('Batata frita', { exact: true }).first()).toBeVisible();
});

test('combo: produto esgotado numa parte fixa esgota o combo; na escolha, só a opção', async ({ page }) => {
  await montarHamburgueria(page);
  const form = await cadastrarCombo(page);
  await form.getByRole('button', { name: 'Salvar combo' }).click();
  await expect(page.getByText('Combo salvo. Ele já aparece em Pedidos.')).toBeVisible();

  // Suco esgotou: o combo ainda sai, com o suco riscado.
  await page.goto('/produtos');
  await cartao(page, 'Suco natural').getByRole('switch').click();
  await page.goto('/pedidos');
  await page.getByRole('button', { name: 'Montar Combo X, R$ 30,00' }).click();
  const janela = page.getByRole('dialog', { name: 'Combo X' });
  await janela.getByRole('button', { name: 'Suco natural, esgotado' }).click({ force: true });
  await expect(janela.getByText('Suco natural está esgotado. Ofereça outra opção ao cliente.')).toBeVisible();
  await janela.getByRole('button', { name: 'Fechar a janela' }).click();

  // Batata esgotou: o combo inteiro esgota.
  await page.goto('/produtos');
  await cartao(page, 'Batata frita').getByRole('switch').click();
  await page.goto('/pedidos');
  await page.getByRole('button', { name: 'Combo X, esgotado' }).click({ force: true });
  await expect(page.getByText('Combo X está esgotado: acabou Batata frita. Ofereça outra opção ao cliente.')).toBeVisible();
});

test('promoção: preço mais baixo valendo agora, selo e normal riscado; pausar volta ao normal', async ({ page }) => {
  await montarHamburgueria(page);
  await page.goto('/produtos?aba=promocoes');
  await page.getByRole('button', { name: 'Criar a primeira promoção' }).click();
  const form = page.getByRole('form', { name: 'Nova promoção' });
  await form.getByLabel('Nome', { exact: true }).fill('Dia do X');
  for (const dia of ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']) {
    await form.getByRole('button', { name: dia, exact: true }).click();
  }
  await form.getByLabel('Item 1', { exact: true }).selectOption({ label: 'X-Burguer' });
  await expect(form.getByText('Normal: R$ 18,00')).toBeVisible();
  await form.getByLabel('Item 1, preço na promoção (R$)').fill('20');
  await form.getByRole('button', { name: 'Salvar promoção' }).click();
  await expect(form.getByText('O preço de X-Burguer na promoção precisa ser menor que o normal (R$ 18,00).')).toBeVisible();
  await form.getByLabel('Item 1, preço na promoção (R$)').fill('15');
  await semProblemasDeAcessibilidade(page);
  await form.getByRole('button', { name: 'Salvar promoção' }).click();
  const promo = cartao(page, 'Dia do X');
  await expect(promo).toContainText('Valendo agora');
  await expect(promo).toContainText('Todo dia, o dia todo');

  await page.goto('/pedidos');
  await expect(page.getByText('Promoção hoje').first()).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar X-Burguer, R$ 15,00, em promoção (normal R$ 18,00)' }).click();
  const carrinho = page.getByRole('complementary', { name: 'Pedido' });
  await expect(carrinho).toContainText('Dia do X');
  await expect(carrinho).toContainText('R$ 15,00');
  await semProblemasDeAcessibilidade(page);
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible();

  await page.goto('/produtos?aba=promocoes');
  await cartao(page, 'Dia do X').getByRole('switch', { name: 'Dia do X ligada' }).click();
  await expect(cartao(page, 'Dia do X')).not.toContainText('Valendo agora');
  await page.goto('/pedidos');
  await expect(page.getByRole('button', { name: /^Adicionar X-Burguer, R\$ 18,00/ })).toBeVisible();
});

test('combo em promoção: editar depois de pausar mantém o preço; o relatório conta o combo, as partes e o desconto', async ({ page }) => {
  await montarHamburgueria(page);
  const form = await cadastrarCombo(page);
  await form.getByRole('button', { name: 'Salvar combo' }).click();
  await expect(page.getByText('Combo salvo. Ele já aparece em Pedidos.')).toBeVisible();

  await page.goto('/produtos?aba=promocoes');
  await page.getByRole('button', { name: 'Criar a primeira promoção' }).click();
  const promo = page.getByRole('form', { name: 'Nova promoção' });
  await promo.getByLabel('Nome', { exact: true }).fill('Combo do dia');
  for (const dia of ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']) {
    await promo.getByRole('button', { name: dia, exact: true }).click();
  }
  await promo.getByLabel('Item 1', { exact: true }).selectOption({ label: 'Combo X' });
  await promo.getByLabel('Item 1, preço na promoção (R$)').fill('25');
  await promo.getByRole('button', { name: 'Salvar promoção' }).click();
  await expect(cartao(page, 'Combo do dia')).toContainText('Valendo agora');

  await page.goto('/pedidos');
  await page.getByRole('button', { name: 'Montar Combo X, R$ 25,00, em promoção (normal R$ 30,00)' }).click();
  const janela = page.getByRole('dialog', { name: 'Combo X' });
  await janela.getByRole('button', { name: 'Refrigerante lata', exact: true }).click();
  await janela.getByRole('button', { name: 'Adicionar Combo X, R$ 25,00' }).click();
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible();

  await page.goto('/produtos?aba=promocoes');
  await cartao(page, 'Combo do dia').getByRole('switch', { name: 'Combo do dia ligada' }).click();
  await expect(cartao(page, 'Combo do dia')).not.toContainText('Valendo agora');

  await page.goto('/pedidos');
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  const carrinho = page.getByRole('complementary', { name: /^Pedido/ });
  await expect(carrinho.getByText('X-Burguer, Batata frita, Refrigerante lata')).toBeVisible();
  await expect(carrinho).toContainText('Combo do dia');
  await carrinho.getByRole('button', { name: 'Mais um Combo X' }).click();
  await expect(carrinho).toContainText('R$ 55,00');
  await expect(carrinho).toContainText('1 pelo preço combinado, 1 pelo preço de hoje');
  await carrinho.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('complementary', { name: 'Pedido' })).toBeVisible();

  await page.goto('/relatorios');
  const combos = page.getByRole('region', { name: 'Combos' });
  await expect(combos).toContainText('Combo X');
  await expect(combos).toContainText('2 vendidos');
  const promocoes = page.getByRole('region', { name: 'Promoções' });
  await expect(promocoes).toContainText('Combo do dia');
  await expect(promocoes).toContainText('1 venda');
  await expect(promocoes).toContainText('R$ 5,00 de desconto');
  await expect(page.getByText('sendo 2 em combo').first()).toBeVisible();
  await semProblemasDeAcessibilidade(page);
});
