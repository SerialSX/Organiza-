import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { abrirConta, enviar, escolherMesa, montarEspetaria } from './ajuda';

// Mapa das mesas, mesa extra, passar e juntar mesas, fechar a conta (um pagou,
// dividiram, pagaram separado), taxa de serviço e o Caixa.
// A demonstração começa com 8 mesas e 10% de serviço.
// Espeto de carne R$ 9, Espeto de frango R$ 8, Cerveja lata R$ 7.

async function semProblemasDeAcessibilidade(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

async function adicionar(page, nome) {
  await page.getByRole('button', { name: new RegExp(`^Adicionar ${nome},`) }).click();
}

async function pedir(page, mesa, itens) {
  await escolherMesa(page, mesa);
  for (const nome of itens) await adicionar(page, nome);
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: /Entrou na conta da mesa|Pode levar até a mesa/ }).first()).toBeVisible();
}

const mapa = (page) => page.getByRole('region', { name: 'Mesas', exact: true });

test('mesa livre vira ocupada com o total; a conta mostra o que foi pedido', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await expect(mapa(page).getByRole('button', { name: /^Mesa \d+, livre/ })).toHaveCount(8);
  await semProblemasDeAcessibilidade(page);

  // Sem escolher a mesa, o pedido não sai.
  await page.getByText('Consumo no salão').click();
  await adicionar(page, 'Espeto de carne');
  await enviar(page);
  await expect(page.getByText('Toque na mesa do pedido, no mapa das mesas.').filter({ visible: true }).first()).toBeVisible();

  await escolherMesa(page, 3);
  await expect(page.getByRole('complementary', { name: /^Pedido/ })).toContainText('Pedido para a Mesa 3');
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Entrou na conta da mesa.' }).first()).toContainText('Mesa 3');

  await expect(mapa(page).getByRole('button', { name: 'Mesa 3, ocupada, R$ 9,00, 1 pedido' })).toBeVisible();
  // Lança mais na mesma mesa pela conta.
  await pedir(page, 3, ['Cerveja lata']);
  const conta = await abrirConta(page, 3);
  await expect(conta).toContainText('Espeto de carne');
  await expect(conta).toContainText('Cerveja lata');
  await expect(conta).toContainText('R$ 16,00');
  await semProblemasDeAcessibilidade(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // A cozinha vê a mesa.
  await page.goto('/cozinha');
  await expect(page.getByRole('listitem', { name: 'Pedido 001, mesa 3' })).toBeVisible();
});

test('um pagou tudo com a taxa de serviço; o caixa separa o serviço do vendido', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await pedir(page, 2, ['Espeto de carne', 'Espeto de carne']);
  await pedir(page, 2, ['Cerveja lata']);

  const conta = await abrirConta(page, 2);
  await conta.getByRole('button', { name: 'Fechar mesa' }).click();
  await expect(conta).toContainText('Consumo');
  await expect(conta).toContainText('R$ 25,00');
  await expect(conta).toContainText('Serviço (10%)');
  await expect(conta).toContainText('R$ 2,50');
  await expect(conta).toContainText('R$ 27,50');
  await conta.getByText('Um pagou tudo').click();
  await semProblemasDeAcessibilidade(page);
  await conta.getByRole('group', { name: 'Receber R$ 27,50' }).getByRole('button', { name: 'Pix' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(mapa(page)).toContainText('Mesa 2: conta de R$ 27,50 recebida. A mesa está livre.');
  await expect(mapa(page).getByRole('button', { name: /^Mesa 2, livre/ })).toBeVisible();

  await page.goto('/caixa');
  const recebido = page.getByRole('region', { name: 'Recebido' });
  await expect(recebido).toContainText('R$ 27,50');
  await expect(recebido).toContainText('Taxa de serviço: R$ 2,50');
  await expect(page.getByText('Total vendido no dia (recebido + a receber, sem a taxa de serviço): R$ 25,00')).toBeVisible();
  await semProblemasDeAcessibilidade(page);

  // Recebeu errado: desfaz e a mesa volta aberta.
  await recebido.getByText(/Ver os recebimentos \(1\)/).click();
  await recebido.getByRole('button', { name: 'Desfazer o recebimento da conta da Mesa 2' }).click();
  await expect(page.getByRole('region', { name: 'A receber' })).toContainText('R$ 25,00');
  await page.goto('/pedidos');
  await expect(mapa(page).getByRole('button', { name: /^Mesa 2, ocupada, R\$\s25,00/ })).toBeVisible();
});

test('cliente não quis pagar o serviço e dividiram igual em 3 (o centavo vai para o último)', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await pedir(page, 5, ['Espeto de carne', 'Espeto de frango', 'Cerveja lata']);

  const conta = await abrirConta(page, 5);
  await conta.getByRole('button', { name: 'Fechar mesa' }).click();
  await conta.getByRole('button', { name: 'Cliente não quis pagar o serviço' }).click();
  await expect(conta).toContainText('Não cobrado');
  await conta.getByText('Dividiram, e quero anotar cada parte').click();
  await conta.getByRole('button', { name: 'Uma pessoa a mais' }).click();
  await expect(conta.getByText('Pessoa 1: R$ 8,00')).toBeVisible();
  await expect(conta.getByText('Pessoa 3: R$ 8,00')).toBeVisible();
  const fechar = conta.getByRole('button', { name: 'Fechar a conta: R$ 24,00' });
  await expect(fechar).toBeDisabled();
  await conta.getByRole('group', { name: 'Como a pessoa 1 pagou?' }).getByText('Pix').click();
  await conta.getByRole('group', { name: 'Como a pessoa 2 pagou?' }).getByText('Dinheiro').click();
  await conta.getByRole('group', { name: 'Como a pessoa 3 pagou?' }).getByText('Débito').click();
  await semProblemasDeAcessibilidade(page);
  await fechar.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/caixa');
  const recebido = page.getByRole('region', { name: 'Recebido' });
  await expect(recebido).toContainText('R$ 24,00');
  await expect(recebido).not.toContainText('Taxa de serviço');
});

test('cada um um valor: só fecha quando o "Falta" chega a zero', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await pedir(page, 1, ['Espeto de carne', 'Espeto de carne']);
  // 18 + 1,80 de serviço = 19,80

  const conta = await abrirConta(page, 1);
  await conta.getByRole('button', { name: 'Fechar mesa' }).click();
  await conta.getByText('Dividiram, e quero anotar cada parte').click();
  await conta.getByRole('button', { name: 'Cada um um valor' }).click();
  await conta.getByLabel('Valor da parte 1').fill('10');
  await expect(conta.getByText('Falta R$ 9,80')).toBeVisible();
  await conta.getByLabel('Valor da parte 2').fill('12');
  await expect(conta.getByText('Passou R$ 2,20 do total')).toBeVisible();
  await conta.getByLabel('Valor da parte 2').fill('9,80');
  await expect(conta.getByText('Falta R$ 0,00: bateu com o total.')).toBeVisible();
  const fechar = conta.getByRole('button', { name: 'Fechar a conta: R$ 19,80' });
  await expect(fechar).toBeDisabled();
  await expect(conta.getByText('Escolha como cada parte foi paga.')).toBeVisible();
  await conta.getByRole('group', { name: 'Como a parte 1 foi paga?' }).getByText('Crédito').click();
  await conta.getByRole('group', { name: 'Como a parte 2 foi paga?' }).getByText('Pix').click();
  await semProblemasDeAcessibilidade(page);
  await fechar.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/caixa');
  const formas = page.getByRole('region', { name: 'Recebido' }).locator('dl');
  await expect(formas.locator('div').filter({ hasText: 'Crédito' })).toContainText('R$ 10,00');
  await expect(formas.locator('div').filter({ hasText: 'Pix' })).toContainText('R$ 9,80');
});

test('pagaram separado: a conta fecha sem forma e o caixa mostra "sem detalhe"', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await pedir(page, 4, ['Espeto de frango']);

  const conta = await abrirConta(page, 4);
  await conta.getByRole('button', { name: 'Fechar mesa' }).click();
  await conta.getByText('Pagaram separado (sem anotar)').click();
  await expect(conta.getByText(/Pago separado, sem detalhe/)).toBeVisible();
  await conta.getByRole('button', { name: 'Entendi, não mostrar de novo' }).click();
  await conta.getByRole('button', { name: 'Fechar a conta: R$ 8,80' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/caixa');
  const recebido = page.getByRole('region', { name: 'Recebido' });
  await expect(recebido).toContainText('Pago separado, sem detalhe');
  await expect(recebido).toContainText('R$ 8,80');
});

test('passar para mesa livre e juntar com mesa ocupada (confirma com os totais)', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await pedir(page, 6, ['Espeto de carne']);
  await pedir(page, 7, ['Cerveja lata']);

  let conta = await abrirConta(page, 6);
  await conta.getByRole('button', { name: 'Passar para outra mesa' }).click();
  await semProblemasDeAcessibilidade(page);
  await conta.getByRole('button', { name: 'Mesa 1, livre' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(mapa(page)).toContainText('A conta da Mesa 6 passou para a Mesa 1.');
  await expect(mapa(page).getByRole('button', { name: /^Mesa 6, livre/ })).toBeVisible();

  conta = await abrirConta(page, 1);
  await conta.getByRole('button', { name: 'Passar para outra mesa' }).click();
  await conta.getByRole('button', { name: 'Mesa 7, ocupada, R$ 7,00' }).click();
  await expect(conta).toContainText('A Mesa 7 já tem conta aberta. Juntar as duas?');
  await expect(conta).toContainText('R$ 16,00');
  await conta.getByRole('button', { name: 'Juntar as mesas' }).click();
  await expect(mapa(page)).toContainText('Mesa 1 juntou com a Mesa 7: a conta agora é R$ 16,00.');
  await expect(mapa(page).getByRole('button', { name: 'Mesa 7, ocupada, R$ 16,00, 2 pedidos' })).toBeVisible();
});

test('mesa extra com nome: aparece no mapa, na cozinha e some quando fecha', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await mapa(page).getByRole('button', { name: '+ Mesa extra' }).click();
  await expect(page.getByLabel('Nome da mesa extra')).toHaveValue('Extra 1');
  await page.getByLabel('Nome da mesa extra').fill('Varanda');
  await page.getByRole('button', { name: 'Abrir mesa extra' }).click();
  await expect(mapa(page).getByRole('button', { name: 'Varanda, livre, pedido sendo montado para esta mesa' })).toBeVisible();
  await adicionar(page, 'Espeto de carne');
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Entrou na conta da mesa.' }).first()).toContainText('Varanda');
  await expect(mapa(page).getByRole('button', { name: /^Varanda, ocupada, R\$\s9,00/ })).toBeVisible();

  await page.goto('/cozinha');
  await expect(page.getByRole('listitem', { name: 'Pedido 001, Varanda' })).toBeVisible();

  await page.goto('/pedidos');
  const conta = await abrirConta(page, 'Varanda');
  await conta.getByRole('button', { name: 'Fechar mesa' }).click();
  await conta.getByText('Um pagou tudo').click();
  await conta.getByRole('button', { name: 'Dinheiro' }).click();
  await expect(mapa(page).getByRole('button', { name: /^Varanda/ })).toHaveCount(0);
});

test('pedido pago na conta da mesa não muda de valor nem é cancelado sem desfazer', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await pedir(page, 8, ['Espeto de carne']);
  const conta = await abrirConta(page, 8);
  await conta.getByRole('button', { name: 'Fechar mesa' }).click();
  await conta.getByText('Um pagou tudo').click();
  await conta.getByRole('button', { name: 'Pix' }).click();

  // Ainda na cozinha: aparece como pago na conta.
  const naCozinha = page.getByRole('region', { name: 'Na cozinha' });
  await expect(naCozinha).toContainText('Pago na conta da mesa');
  await naCozinha.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('group', { name: 'Motivo do cancelamento' }).getByRole('button').first().click();
  await expect(page.getByText('Este pedido já foi pago na conta da mesa. Para cancelar, desfaça o recebimento da conta no Caixa.').first()).toBeVisible();
});

test('Minha conta: muda o número de mesas e a taxa', async ({ page }) => {
  await page.goto('/minha-conta');
  await page.getByRole('button', { name: 'Uma mesa a mais' }).click();
  await page.getByRole('button', { name: 'Aumentar a taxa' }).click();
  await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Como você atende' }) }).getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Salvo.')).toBeVisible();
  await semProblemasDeAcessibilidade(page);

  await montarEspetaria(page);
  await page.goto('/pedidos');
  await expect(mapa(page).getByRole('button', { name: /^Mesa \d+, livre/ })).toHaveCount(9);
  await pedir(page, 9, ['Espeto de carne', 'Espeto de carne']);
  const conta = await abrirConta(page, 9);
  await conta.getByRole('button', { name: 'Fechar mesa' }).click();
  await expect(conta).toContainText('Serviço (11%)');
  await expect(conta).toContainText('R$ 1,98');
});
