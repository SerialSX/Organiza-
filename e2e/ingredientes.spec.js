import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { lancarPedido } from './ajuda';

async function semProblemasDeAcessibilidade(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

async function cadastrarIngrediente(page, nome, { preco, quantidade, unidade } = {}) {
  await page.goto('/produtos?aba=ingredientes');
  await page.getByRole('button', { name: /Novo ingrediente|Cadastrar o primeiro ingrediente/ }).first().click();
  const form = page.getByRole('form', { name: 'Novo ingrediente' });
  await form.getByLabel('Nome', { exact: true }).fill(nome);
  if (preco) {
    await form.getByLabel('Quanto você paga (R$, opcional)').fill(preco);
    await form.getByLabel('Por quanto').fill(quantidade);
    await form.getByLabel('Unidade').selectOption(unidade);
  }
  await form.getByRole('button', { name: 'Salvar ingrediente' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: nome })).toBeVisible();
}

async function cadastrarXBurguer(page) {
  await cadastrarIngrediente(page, 'Carne moída', { preco: '40', quantidade: '1', unidade: 'kg' });
  await cadastrarIngrediente(page, 'Pão', { preco: '12', quantidade: '12', unidade: 'un' });
  await cadastrarIngrediente(page, 'Queijo');

  await page.goto('/produtos');
  await page.getByRole('button', { name: /Novo produto|Cadastrar o primeiro produto/ }).first().click();
  const form = page.getByRole('form', { name: 'Novo produto' });
  await form.getByLabel('Nome', { exact: true }).fill('X-Burguer');
  await form.getByLabel('Preço de venda (R$)').fill('18,50');
  for (const [nome, unidade, qtd] of [
    ['Carne moída', 'g', '120'],
    ['Pão', 'un', '1'],
    ['Queijo', 'g', '30'],
  ]) {
    await form.getByLabel('Adicionar ingrediente').selectOption({ label: `${nome} (${unidade})` });
    await form.getByLabel(new RegExp(`^Quanto vai de ${nome} em`)).fill(qtd);
  }
  // 120 g × R$ 40/kg + 1 pão × R$ 1 = R$ 5,80; o queijo não tem preço
  await expect(form.getByText('R$ 5,80', { exact: true })).toBeVisible();
  await expect(form.getByText(/Queijo está sem preço/)).toBeVisible();
  await expect(form.getByText(/Lucro de R\$\s12,70 por unidade/)).toBeVisible();
  await semProblemasDeAcessibilidade(page);
  await form.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(page.getByText('Custo R$ 5,80 (pelos ingredientes), lucro de R$ 12,70 cada')).toBeVisible();
}

test('custo do produto sai dos ingredientes e acompanha o preço', async ({ page }) => {
  await cadastrarXBurguer(page);

  await page.goto('/produtos?aba=ingredientes');
  await page.getByRole('button', { name: 'Editar Carne moída' }).click();
  await page.getByLabel('Quanto você paga (R$, opcional)').fill('50');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Custo atualizado em: X-Burguer.')).toBeVisible();

  await page.getByRole('button', { name: 'Produtos', exact: true }).click();
  await expect(page.getByText('Custo R$ 7,00 (pelos ingredientes), lucro de R$ 11,50 cada')).toBeVisible();
});

test('cozinha avisa o ingrediente que faltou e todo mundo fica sabendo', async ({ page }) => {
  await cadastrarXBurguer(page);
  const senha = await lancarPedido(page, ['X-Burguer']);

  await page.goto('/cozinha');
  const cartao = page.getByRole('listitem', { name: `Pedido ${senha}` });
  await cartao.getByRole('button', { name: 'Avisar que faltou um ingrediente de X-Burguer' }).click();
  await cartao.getByRole('group', { name: 'O que faltou para X-Burguer?' }).getByRole('button', { name: 'Queijo' }).click();
  await expect(cartao.getByText('Faltou: queijo')).toBeVisible();
  await semProblemasDeAcessibilidade(page);

  await page.goto('/pedidos');
  await expect(page.getByText(/A cozinha avisou que faltou: X-Burguer \(queijo\)/)).toBeVisible();

  await page.goto('/p/demonstracao');
  await page.getByLabel('Senha do pedido').fill(senha);
  await page.getByLabel('Senha do pedido').press('Enter');
  await expect(page.getByText('Faltou algo para o seu pedido. Fale com o atendente.')).toBeVisible();

  await page.goto('/relatorios');
  const faltas = page.getByRole('region', { name: 'Faltou na cozinha' });
  await expect(faltas.getByText('Queijo')).toBeVisible();
  await expect(faltas.getByText('1 vez')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pedidos por hora' })).toContainText('Mais movimento');
  await semProblemasDeAcessibilidade(page);
});

test('acabou um ingrediente: esgota de uma vez os produtos que o levam', async ({ page }) => {
  await cadastrarXBurguer(page);
  await page.goto('/cozinha?aba=esgotados');
  await page.getByRole('region', { name: 'Acabou um ingrediente?' }).getByRole('button', { name: 'Queijo' }).click();
  await page.getByRole('button', { name: 'Sim, esgotar' }).click();
  await expect(page.getByRole('button', { name: 'X-Burguer, esgotado. Tocar marca que voltou' })).toBeVisible();

  await page.goto('/pedidos');
  await expect(page.getByRole('button', { name: 'X-Burguer, esgotado' })).toBeDisabled();
});

test('excluir ingrediente avisa em quantos produtos ele está', async ({ page }) => {
  await cadastrarXBurguer(page);
  await page.goto('/produtos?aba=ingredientes');
  await page.getByRole('button', { name: 'Excluir Pão' }).click();
  await expect(page.getByText('Sai de 1 produto. Excluir?')).toBeVisible();
  await page.getByRole('button', { name: 'Sim' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: /^Pão/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Produtos', exact: true }).click();
  await expect(page.getByText('Custo R$ 4,80 (pelos ingredientes), lucro de R$ 13,70 cada')).toBeVisible();
});
