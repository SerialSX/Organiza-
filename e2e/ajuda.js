import { expect } from '@playwright/test';

// Produtos para o modo demonstração. Cada teste começa com o navegador
// limpo, então cadastra o que precisar.
export async function cadastrarProduto(page, nome, preco) {
  await page.goto('/produtos');
  await page.getByRole('button', { name: /Novo produto|Cadastrar o primeiro produto/ }).first().click();
  await page.getByLabel('Nome', { exact: true }).fill(nome);
  await page.getByLabel('Preço de venda (R$)').fill(preco);
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(page.getByText(nome, { exact: true })).toBeVisible();
}

// Lança um pedido e devolve a senha mostrada para o cliente ("001").
export async function lancarPedido(page, itens) {
  await page.goto('/pedidos');
  for (const nome of itens) {
    await page.getByRole('button', { name: new RegExp(`^Adicionar ${nome},`) }).click();
  }
  await page.getByRole('button', { name: /^Enviar( para a cozinha)?$/ }).filter({ visible: true }).first().click();
  // No celular o aviso também aparece na barra de baixo, escondido do leitor
  // de tela; getByRole só acha o do carrinho.
  const aviso = page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' });
  await expect(aviso).toBeVisible();
  return (await aviso.locator('p').nth(1).innerText()).trim();
}
