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

// Pedido de balcão: o cliente paga na hora, então a forma é obrigatória.
// forma: null para não tocar em nenhuma (testar o bloqueio, ou pedido de mesa).
export async function pagar(page, forma = 'Pix') {
  const pagamento = page.getByRole('group', { name: 'Como o cliente pagou?' });
  if (!forma || !(await pagamento.isVisible())) return;
  const botao = pagamento.getByRole('button', { name: forma, exact: true });
  if ((await botao.getAttribute('aria-pressed')) !== 'true') await botao.click();
}

// O botão de envio muda com o jeito de trabalhar (com ou sem tela de cozinha)
// e com o tamanho da tela (barra de baixo no celular).
export async function enviar(page, { forma = 'Pix' } = {}) {
  await pagar(page, forma);
  await page
    .getByRole('button', { name: /^(Enviar( para a cozinha)?|Lançar pedido)$/ })
    .filter({ visible: true })
    .first()
    .click();
}

// Começa com o cardápio pronto de espetaria (tem bebida que não vai para a cozinha).
export async function montarEspetaria(page) {
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Espetaria' }).click();
  await expect(page.getByText('Espeto de carne', { exact: true })).toBeVisible();
}

// Lança um pedido e devolve a senha mostrada para o cliente ("001").
export async function lancarPedido(page, itens) {
  await page.goto('/pedidos');
  for (const nome of itens) {
    await page.getByRole('button', { name: new RegExp(`^Adicionar ${nome},`) }).click();
  }
  await enviar(page);
  // No celular o aviso também aparece na barra de baixo, escondido do leitor
  // de tela; getByRole só acha o do carrinho.
  const aviso = page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' });
  await expect(aviso).toBeVisible();
  return (await aviso.locator('p').nth(1).innerText()).trim();
}

// Escolhe a mesa do pedido no mapa das mesas. Mesa livre: o pedido vai para
// ela. Mesa ocupada: abre a conta, e "Lançar mais" põe o pedido nela.
export async function escolherMesa(page, mesa) {
  const mapa = page.getByRole('region', { name: 'Mesas', exact: true });
  const cartao = mapa.getByRole('button', { name: new RegExp(`^${typeof mesa === 'number' ? `Mesa ${mesa}` : mesa},`) });
  await cartao.click();
  const conta = page.getByRole('dialog');
  if (await conta.isVisible()) await conta.getByRole('button', { name: 'Lançar mais nesta mesa' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

// Abre a conta de uma mesa ocupada (a janela com Lançar mais, Fechar, Passar).
export async function abrirConta(page, mesa) {
  const mapa = page.getByRole('region', { name: 'Mesas', exact: true });
  await mapa.getByRole('button', { name: new RegExp(`^${typeof mesa === 'number' ? `Mesa ${mesa}` : mesa}, ocupada`) }).click();
  const conta = page.getByRole('dialog');
  await expect(conta).toBeVisible();
  return conta;
}
