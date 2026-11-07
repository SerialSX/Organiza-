import { test, expect } from '@playwright/test';
import { cadastrarProduto, escolherMesa, lancarPedido } from './ajuda';

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

test('pedido na mesa: sem o número não sai, e a cozinha vê a mesa', async ({ page }) => {
  await cadastrarProduto(page, 'Tapioca', '7');
  await page.goto('/pedidos');
  await page.getByRole('button', { name: /^Adicionar Tapioca,/ }).click();
  await page.getByText('Consumo no salão').click();
  const enviar = page.getByRole('button', { name: /^Enviar( para a cozinha)?$/ }).filter({ visible: true }).first();

  await enviar.click();
  // No celular o erro também aparece na barra de baixo (escondido do leitor de tela).
  await expect(page.getByText('Toque na mesa do pedido, no mapa das mesas.').filter({ visible: true }).first()).toBeVisible();

  await escolherMesa(page, 7);
  await enviar.click();
  // Mesa: não tem senha para falar; quem atende leva até a mesa.
  const aviso = page.getByRole('status').filter({ hasText: 'Entrou na conta da mesa.' });
  await expect(aviso).toContainText('Mesa 7');
  await expect(aviso).not.toContainText('senha');

  await page.goto('/cozinha');
  const cartao = page.getByRole('listitem', { name: 'Pedido 001, mesa 7' });
  await expect(cartao).toContainText('Mesa 7');
  await expect(cartao).toContainText('1º');
});

test('modo monitor mostra só a fila, sem o menu do sistema', async ({ page }) => {
  await cadastrarProduto(page, 'Cuscuz', '9');
  const senha = await lancarPedido(page, ['Cuscuz']);

  await page.goto('/cozinha?modo=monitor');
  await expect(page.getByRole('heading', { name: 'Cozinha' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);
  const cartao = page.getByRole('listitem', { name: `Pedido ${senha}` });
  await expect(cartao).toContainText('Balcão');
  await expect(cartao).not.toContainText('R$');
  await cartao.getByRole('button', { name: 'Pronto' }).click();
  await expect(cartao).toBeHidden();

  await page.getByRole('link', { name: 'Sair do modo monitor' }).click();
  await expect(page).toHaveURL(/\/cozinha$/);
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
