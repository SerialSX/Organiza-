import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { enviar } from './ajuda';

// Tamanhos (pizza P, M, G): cadastro no produto, um botão por tamanho em
// Pedidos, selo grande na Cozinha, esgotado por tamanho, edição e relatório.

async function semProblemasDeAcessibilidade(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

const cartao = (page, nome) => page.getByRole('listitem').filter({ has: page.getByText(nome, { exact: true }) });

test('cadastra pizza com tamanhos, vende cada tamanho e a cozinha vê o tamanho grande', async ({ page, context }) => {
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Cadastrar o primeiro produto' }).click();
  const form = page.getByRole('form', { name: 'Novo produto' });
  await form.getByLabel('Nome', { exact: true }).fill('Pizza Calabresa');
  await form.getByLabel('Tem tamanhos?').check();
  await expect(form.getByLabel('Preço de venda (R$)')).toHaveCount(0);
  await form.getByRole('button', { name: 'P · M · G' }).click();
  await form.getByLabel('Preço de Pizza Calabresa P').fill('35');
  await form.getByLabel('Preço de Pizza Calabresa M').fill('45');
  await form.getByLabel('Preço de Pizza Calabresa G').fill('55');
  await form.getByLabel('Custo de Pizza Calabresa G').fill('20');
  await expect(form.getByText('Lucro de R$ 35,00 cada')).toBeVisible();
  await semProblemasDeAcessibilidade(page);

  // Salvar com um tamanho repetido aponta o erro na linha.
  await form.getByLabel('Nome do tamanho 2 de Pizza Calabresa').fill('p');
  await form.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(form.getByText('Já tem um tamanho com esse nome.')).toBeVisible();
  await form.getByLabel('Nome do tamanho 2 de Pizza Calabresa').fill('M');
  await form.getByRole('button', { name: 'Salvar produto' }).click();

  const pizza = cartao(page, 'Pizza Calabresa');
  await expect(pizza).toContainText('R$ 35,00 a R$ 55,00');
  await expect(pizza).toContainText('G · R$ 55,00');

  // Esgotou a G: só ela some do pedido.
  await pizza.getByRole('switch', { name: 'Pizza Calabresa G disponível' }).click();
  await expect(pizza.getByText('Esgotado', { exact: true })).toBeVisible();

  await page.goto('/pedidos');
  const grupo = page.getByRole('group', { name: 'Pizza Calabresa' });
  await expect(grupo.getByRole('button')).toHaveCount(3);
  // aria-disabled: o toque chega de propósito (avisa e conta a venda evitada).
  await grupo.getByRole('button', { name: /^Pizza Calabresa G, esgotado/ }).click({ force: true });
  await expect(page.getByText('Pizza Calabresa (G) está esgotado. Ofereça outra opção ao cliente.')).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar Pizza Calabresa M, R$ 45,00' }).click();
  await page.getByRole('button', { name: 'Adicionar Pizza Calabresa M, R$ 45,00, 1 no pedido' }).click();
  await page.getByRole('button', { name: 'Adicionar Pizza Calabresa P, R$ 35,00' }).click();
  const carrinho = page.getByRole('complementary', { name: 'Pedido' });
  await expect(carrinho.getByText('Pizza Calabresa (M)')).toBeVisible();
  await expect(carrinho.getByText('Pizza Calabresa (P)')).toBeVisible();
  await expect(carrinho).toContainText('R$ 125,00');
  await semProblemasDeAcessibilidade(page);
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible();

  const cozinha = await context.newPage();
  await cozinha.goto('/cozinha');
  // O tamanho vem antes do nome, num selo grande.
  await expect(cozinha.getByLabel('tamanho M')).toBeVisible();
  await expect(cozinha.getByLabel('tamanho P')).toBeVisible();
  await expect(cozinha.getByText('2×', { exact: true })).toBeVisible();

  // A cozinha também esgota um tamanho só.
  await cozinha.getByRole('group', { name: 'O que mostrar' }).getByRole('button', { name: 'Esgotados' }).click();
  await cozinha.getByRole('button', { name: 'Pizza Calabresa P, tem. Tocar marca como esgotado' }).click();
  await expect(cozinha.getByRole('button', { name: 'Pizza Calabresa P, esgotado. Tocar marca que voltou' })).toBeVisible();
  await page.goto('/pedidos');
  await expect(page.getByRole('button', { name: /^Pizza Calabresa P, esgotado/ })).toBeVisible();
});

test('editar o pedido troca o tamanho com o preço certo; o relatório mostra cada tamanho', async ({ page }) => {
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Pizzaria' }).click();
  await expect(cartao(page, 'Pizza Mussarela')).toContainText('R$ 33,00 a R$ 52,00');
  await expect(cartao(page, 'Refrigerante 2 litros')).toContainText('Sem cozinha');

  await page.goto('/pedidos');
  await page.getByRole('button', { name: 'Adicionar Pizza Mussarela P, R$ 33,00' }).click();
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible();

  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  const carrinho = page.getByRole('complementary', { name: /^Pedido/ });
  await carrinho.getByRole('button', { name: 'Tirar Pizza Mussarela (P) do pedido' }).click();
  await page.getByRole('button', { name: 'Adicionar Pizza Mussarela G, R$ 52,00' }).click();
  await expect(carrinho.getByText('Pizza Mussarela (G)')).toBeVisible();
  await expect(carrinho).toContainText('R$ 52,00');
  await page.getByRole('button', { name: /^Salvar( alterações)?$/ }).filter({ visible: true }).first().click();
  await expect(page.getByText(/alterado/).first()).toBeVisible();

  await page.goto('/relatorios');
  await expect(page.getByText('Pizza Mussarela', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('G 1', { exact: true })).toBeVisible();
});

test('planilha com a coluna Tamanho vira produto com tamanhos', async ({ page }) => {
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Importar planilha' }).click();
  const secao = page.getByRole('region', { name: 'Importar planilha' });
  const csv = ['Produto;Tamanho;Preço', 'Açaí;300 ml;12', 'Açaí;500 ml;18', 'Tapioca;;8'].join('\r\n');
  await secao.locator('input[type=file]').setInputFiles({ name: 'acai.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await expect(secao).toContainText('2 produtos encontrados em acai.csv.');
  await expect(secao.getByLabel('Preço do tamanho 500 ml')).toHaveValue('18,00');
  await semProblemasDeAcessibilidade(page);
  await secao.getByRole('button', { name: 'Salvar: 2 novos' }).click();
  await expect(page.getByText('2 produtos novos entraram no cardápio.')).toBeVisible();
  await expect(cartao(page, 'Açaí')).toContainText('300 ml · R$ 12,00');
  await expect(cartao(page, 'Tapioca')).toContainText('R$ 8,00');
});
