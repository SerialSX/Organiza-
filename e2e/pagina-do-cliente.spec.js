import { test, expect } from '@playwright/test';
import { cadastrarProduto, lancarPedido } from './ajuda';

test('cliente acompanha o pedido pela senha, sem cadastro', async ({ page }) => {
  await cadastrarProduto(page, 'Cuscuz', '9');
  const senha = await lancarPedido(page, ['Cuscuz']);

  await page.goto('/pagina-do-cliente');
  await page.getByLabel('Nome que aparece para o cliente').fill('Barraca da Dona Rita');
  await page.getByRole('button', { name: 'Salvar nome' }).click();

  await page.goto('/p/demonstracao');
  await expect(page.getByText('Barraca da Dona Rita').first()).toBeVisible();
  await expect(page.getByText('Organiza+')).toHaveCount(0);

  await page.getByLabel('Senha do pedido').fill(senha.replace(/^0+/, ''));
  await page.getByLabel('Senha do pedido').press('Enter');
  await expect(page.getByText(`Senha ${senha}`).first()).toBeVisible();
});

test('senha que não existe mostra aviso', async ({ page }) => {
  await page.goto('/p/demonstracao');
  await page.getByLabel('Senha do pedido').fill('42');
  await page.getByLabel('Senha do pedido').press('Enter');
  await expect(page.getByText('Não achamos a senha 042 hoje')).toBeVisible();
});

test('endereço errado não mostra nada do negócio', async ({ page }) => {
  await page.goto('/p/nao-existe');
  await expect(page.getByText(/Página não encontrada/i).first()).toBeVisible();
});
