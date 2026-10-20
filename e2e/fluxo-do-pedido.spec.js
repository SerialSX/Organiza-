import { test, expect } from '@playwright/test';
import { cadastrarProduto, lancarPedido } from './ajuda';

test('pedido sai do atendente, passa pela cozinha e é entregue', async ({ page }) => {
  await cadastrarProduto(page, 'Pastel de carne', '8,50');
  await cadastrarProduto(page, 'Caldo de cana', '6');

  const senha = await lancarPedido(page, ['Pastel de carne', 'Caldo de cana']);
  expect(senha).toBe('001');

  // A cozinha vê os itens, mas não o preço.
  await page.goto('/cozinha');
  const cartao = page.getByRole('listitem', { name: `Pedido ${senha}` });
  await expect(cartao).toContainText('Pastel de carne');
  await expect(cartao).not.toContainText('R$');
  await cartao.getByRole('button', { name: 'Pronto' }).click();
  await expect(cartao).toBeHidden();

  await page.goto('/pedidos');
  await page.getByRole('button', { name: /Entregue/ }).first().click();
  await expect(page.getByRole('listitem', { name: `Pedido ${senha}` })).toBeHidden();
});

test('as senhas seguem em ordem com três dígitos', async ({ page }) => {
  await cadastrarProduto(page, 'Tapioca', '7');
  expect(await lancarPedido(page, ['Tapioca'])).toBe('001');
  expect(await lancarPedido(page, ['Tapioca'])).toBe('002');
});

test('cancelar pedido pede o motivo', async ({ page }) => {
  await cadastrarProduto(page, 'Coxinha', '5');
  const senha = await lancarPedido(page, ['Coxinha']);
  await page.goto('/pedidos');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).first().click();
  const motivos = page.getByRole('group', { name: 'Motivo do cancelamento' });
  await expect(motivos).toBeVisible();
  await motivos.getByRole('button').first().click();

  await page.goto('/cozinha');
  await expect(page.getByRole('listitem', { name: `Pedido ${senha} cancelado` })).toBeVisible();
});
