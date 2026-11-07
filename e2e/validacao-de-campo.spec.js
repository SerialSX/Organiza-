import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { abrirConta, enviar, escolherMesa, lancarPedido, montarEspetaria, pagar } from './ajuda';

// O que os três negócios da validação de campo pediram (Batata Delas,
// Império do Sabor e Espetaria VIP), do jeito que eles usariam.

async function semProblemasDeAcessibilidade(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

async function adicionar(page, nome) {
  await page.getByRole('button', { name: new RegExp(`^Adicionar ${nome},`) }).click();
}

test('bebida sai pronta e não ocupa a fila da cozinha (espetaria)', async ({ page }) => {
  await montarEspetaria(page);
  await expect(page.getByRole('listitem').filter({ hasText: 'Cerveja lata' }).getByText('Sem cozinha')).toBeVisible();

  await page.goto('/pedidos');
  await adicionar(page, 'Refrigerante lata');
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Pronto para entregar.' })).toBeVisible();

  await adicionar(page, 'Espeto de carne');
  await adicionar(page, 'Cerveja lata');
  await enviar(page);
  const aviso = page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' });
  const senha = (await aviso.locator('p').nth(1).innerText()).trim();

  await page.goto('/cozinha');
  const cartoes = page.getByRole('list', { name: 'Fila de pedidos' }).getByRole('listitem', { name: /^Pedido / });
  await expect(cartoes).toHaveCount(1);
  const cartao = page.getByRole('listitem', { name: `Pedido ${senha}` });
  await expect(cartao).toContainText('Espeto de carne');
  await expect(cartao).toContainText('Sai junto, sem preparo: 1× Cerveja lata');
});

test('a mesa pede aos poucos, soma tudo e fecha a conta de uma vez; o caixa bate (espetaria e hamburgueria)', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');

  await adicionar(page, 'Espeto de carne');
  await escolherMesa(page, 4);
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Mesa 4' })).toBeVisible();
  // Na mesa não se anota pagamento na hora do pedido.
  await expect(page.getByRole('group', { name: 'Como o cliente pagou?' })).toHaveCount(0);

  // Segundo pedido da mesma mesa: a mesa volta em branco (nada vai para a
  // mesa errada); toca nela de novo e "Lançar mais".
  await adicionar(page, 'Cerveja lata');
  await expect(page.getByText('Nenhuma mesa escolhida.')).toBeVisible();
  await escolherMesa(page, 4);
  await enviar(page);

  const mapa = page.getByRole('region', { name: 'Mesas', exact: true });
  await expect(mapa.getByRole('button', { name: 'Mesa 4, ocupada, R$ 16,00, 2 pedidos' })).toBeVisible();
  await semProblemasDeAcessibilidade(page);

  // 16 + 10% de serviço.
  const conta = await abrirConta(page, 4);
  await conta.getByRole('button', { name: 'Fechar mesa' }).click();
  await conta.getByText('Um pagou tudo').click();
  await conta.getByRole('button', { name: 'Pix' }).click();
  await expect(mapa.getByRole('button', { name: /^Mesa 4, livre/ })).toBeVisible();

  // Outra mesa fica aberta para o caixa mostrar o que falta receber.
  await adicionar(page, 'Espeto de linguiça');
  await escolherMesa(page, 7);
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Mesa 7' })).toBeVisible();

  // No balcão o cliente paga na hora: sem dizer como, o pedido não sai.
  await page.getByText('Retira pela senha').click();
  await adicionar(page, 'Espeto de frango');
  await enviar(page, { forma: null });
  await expect(page.getByRole('alert').filter({ hasText: 'Toque em como o cliente pagou.' })).toBeVisible();
  await pagar(page, 'Dinheiro');
  await enviar(page, { forma: null });
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible();

  await page.goto('/caixa');
  const recebido = page.getByRole('region', { name: 'Recebido' });
  await expect(recebido).toContainText('R$ 25,60');
  await expect(recebido.locator('dl').getByText('R$ 17,60')).toBeVisible();
  await expect(recebido).toContainText('Taxa de serviço: R$ 1,60');
  await expect(recebido.locator('dl').getByText('R$ 8,00')).toBeVisible();
  const aReceber = page.getByRole('region', { name: 'A receber' });
  await expect(aReceber).toContainText('R$ 8,00');
  await semProblemasDeAcessibilidade(page);

  await aReceber.getByRole('button', { name: 'Crédito' }).click();
  await expect(page.getByText('Tudo recebido. O caixa fechou certinho.')).toBeVisible();
  await expect(recebido).toContainText('R$ 33,60');
});

test('cozinha do lado do balcão: o "Pronto" fica na tela de pedidos (pastelaria)', async ({ page }) => {
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Pastelaria' }).click();
  await expect(page.getByText('Pastel de carne', { exact: true })).toBeVisible();

  await page.goto('/minha-conta');
  await page.getByText('Não, eu mesmo preparo ou a cozinha fica do meu lado').click();
  await page.getByRole('button', { name: 'Salvar' }).last().click();
  await expect(page.getByText('Salvo.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Principal' }).first().getByRole('link', { name: 'Cozinha' })).toHaveCount(0);

  const senha = await lancarPedido(page, ['Pastel de carne']);
  const preparando = page.getByRole('region', { name: 'Preparando' });
  await preparando.getByRole('listitem').filter({ hasText: senha }).getByRole('button', { name: 'Pronto' }).click();
  await expect(page.getByRole('region', { name: 'Prontos para entregar' }).getByText(senha)).toBeVisible();
});

test('a internet cai: o pedido fica guardado e sai sozinho quando ela volta (hamburgueria)', async ({ page, context }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  // A tela já aberta segue funcionando sem internet; abrir uma tela nova sem
  // internet ainda não dá (precisaria do app instalável, PWA).
  await expect(page.getByRole('button', { name: /^Adicionar Espeto de carne,/ })).toBeVisible();
  await context.setOffline(true);
  await adicionar(page, 'Espeto de carne');
  // O nome é opcional e fica escondido até alguém pedir.
  await expect(page.getByLabel('Nome do cliente (opcional)')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Anotar o nome do cliente (se quiser)' }).click();
  await page.getByLabel('Nome do cliente (opcional)').fill('Carlos');
  await enviar(page);
  const fila = page.getByRole('region', { name: '1 pedido esperando a internet' });
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('Carlos: 1× Espeto de carne');

  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible({ timeout: 15000 });
  await expect(fila).toBeHidden();
  await expect(page.getByRole('region', { name: 'Na cozinha' }).getByText('Carlos')).toBeVisible();
});

test('tocar num produto esgotado avisa o atendente', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/cozinha?aba=esgotados');
  await page.getByRole('button', { name: 'Espeto de carne, tem. Tocar marca como esgotado' }).click();
  await page.goto('/pedidos');
  // O Playwright não clica em aria-disabled; uma pessoa tocando na tela consegue.
  await page.getByRole('button', { name: 'Espeto de carne, esgotado' }).click({ force: true });
  await expect(page.getByText('Espeto de carne está esgotado. Ofereça outra opção ao cliente.')).toBeVisible();
});

test('ajuda responde o que os negócios perguntaram', async ({ page }) => {
  await page.goto('/ajuda');
  await expect(page.getByRole('heading', { name: 'Ajuda', level: 1 })).toBeVisible();
  for (const pergunta of [
    'Quem cadastra o cardápio?',
    'A internet caiu. Perco o pedido?',
    'Fecho depois da meia-noite. O dia vira certo?',
    'Bebida também entra?',
    'Quanto custa?',
  ]) {
    await expect(page.getByText(pergunta)).toBeVisible();
  }
  await page.getByText('A internet caiu. Perco o pedido?').click();
  await expect(page.getByText(/fica guardado no aparelho/)).toBeVisible();
});

// O dia vira sempre às 5h: para fechar antes, "Encerrar o dia" no Caixa.
test('a hora em que o dia de trabalho termina não é mais escolhida', async ({ page }) => {
  await page.goto('/minha-conta');
  await expect(page.getByRole('heading', { name: 'Como você atende' })).toBeVisible();
  await expect(page.getByLabel('O dia de trabalho termina às')).toHaveCount(0);
});
