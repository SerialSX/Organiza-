import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { enviar, montarEspetaria } from './ajuda';

// Correções da revisão da PR #32: o caixa não conta como pago o que mudou de
// valor, a conta da mesa separa os grupos e o pedido guardado sem internet
// sai de qualquer tela.

async function semProblemasDeAcessibilidade(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

async function adicionar(page, nome) {
  await page.getByRole('button', { name: new RegExp(`^Adicionar ${nome},`) }).click();
}

async function pedirNaMesa(page, nome, mesa) {
  await adicionar(page, nome);
  await page.getByText('Consumo no salão').click();
  await page.getByLabel('Número da mesa').fill(String(mesa));
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: `Mesa ${mesa}` }).first()).toBeVisible();
}

test('pedido pago e editado com outro valor volta para "a receber"', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await adicionar(page, 'Espeto de carne');
  await page.getByRole('group', { name: 'Pagamento' }).getByRole('button', { name: 'Pix' }).click();
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible();

  await page.getByRole('region', { name: 'Na cozinha' }).getByRole('button', { name: 'Editar' }).click();
  const carrinho = page.getByRole('complementary', { name: /^Pedido / });
  await expect(carrinho.getByText(/Este pedido já foi pago \(Pix\)/)).toBeVisible();
  await adicionar(page, 'Espeto de carne');
  await expect(carrinho.getByText(/O cliente pagou R\$\s9,00 \(Pix\) e o pedido agora dá R\$\s18,00/)).toBeVisible();
  await semProblemasDeAcessibilidade(page);
  await page.getByRole('button', { name: 'Salvar alterações' }).filter({ visible: true }).first().click();
  await expect(page.getByText(/voltou para “A receber”/).first()).toBeVisible();

  await page.goto('/caixa');
  await expect(page.getByRole('region', { name: 'Recebido' })).toContainText('R$ 0,00');
  await expect(page.getByRole('region', { name: 'A receber' })).toContainText('R$ 18,00');
});

test('recebimento errado no caixa pode ser desfeito', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await adicionar(page, 'Espeto de frango');
  await page.getByRole('group', { name: 'Pagamento' }).getByRole('button', { name: 'Dinheiro' }).click();
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible();

  await page.goto('/caixa');
  const recebido = page.getByRole('region', { name: 'Recebido' });
  await expect(recebido).toContainText('R$ 8,00');
  await recebido.getByText(/Ver os pedidos recebidos \(1\)/).click();
  await semProblemasDeAcessibilidade(page);
  await recebido.getByRole('button', { name: /^Desfazer o recebimento do pedido / }).click();
  await expect(page.getByRole('region', { name: 'A receber' })).toContainText('R$ 8,00');
  await expect(recebido).toContainText('R$ 0,00');
});

test('conta da mesa: desmarca o pedido de outro grupo e recebe só o resto', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await pedirNaMesa(page, 'Espeto de carne', 4);
  await pedirNaMesa(page, 'Cerveja lata', 4);

  const mesa = page.getByRole('region', { name: 'Contas abertas' }).getByRole('listitem').filter({ hasText: 'Mesa 4' }).first();
  await expect(mesa).toContainText('R$ 16,00');
  await mesa.getByRole('button', { name: 'Fechar a conta' }).click();
  const marcas = mesa.getByRole('checkbox');
  await expect(marcas).toHaveCount(2);
  await expect(marcas.nth(0)).toBeChecked();
  await expect(marcas.nth(1)).toBeChecked();
  await semProblemasDeAcessibilidade(page);

  // O segundo grupo (a cerveja) ainda não vai pagar.
  await marcas.nth(1).uncheck();
  await expect(mesa).toContainText('Receber R$ 9,00 (1 pedido)');
  await mesa.getByRole('button', { name: 'Pix' }).click();

  await expect(mesa).toContainText('1 pedido');
  await expect(mesa).toContainText('R$ 7,00');
  await expect(mesa.getByRole('checkbox')).toHaveCount(0);
});

test('pedido guardado sem internet sai mesmo fora da tela de Pedidos', async ({ page, context }) => {
  await montarEspetaria(page);
  // Abre as telas antes, com internet, navegando por dentro do sistema: sem o
  // app instalável (PWA), uma tela nunca aberta não carrega sem conexão.
  const irPara = (nome) => page.getByRole('link', { name: nome, exact: true }).filter({ visible: true }).first().click();
  await page.goto('/caixa');
  await irPara('Pedidos');
  await expect(page.getByRole('button', { name: /^Adicionar Espeto de carne,/ })).toBeVisible();

  await context.setOffline(true);
  await adicionar(page, 'Espeto de carne');
  await page.getByLabel('Nome do cliente (opcional)').fill('Dona Rita');
  await enviar(page);
  await expect(page.getByRole('region', { name: '1 pedido esperando a internet' })).toContainText(/Guardado às \d\d:\d\d/);

  await irPara('Caixa');
  await expect(page).toHaveURL(/\/caixa$/);
  const aviso = page.getByText('1 pedido guardado sem internet, esperando para sair.');
  await expect(aviso).toBeVisible();
  await semProblemasDeAcessibilidade(page);

  await context.setOffline(false);
  await expect(aviso).toBeHidden({ timeout: 15000 });
  await irPara('Pedidos');
  await expect(page.getByRole('region', { name: 'Na cozinha' }).getByText('Dona Rita')).toBeVisible();
});

test('pedido guardado em outro dia não sai sozinho: espera o atendente descartar', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await expect(page.getByRole('button', { name: /^Adicionar Espeto de carne,/ })).toBeVisible();
  // Como se a internet tivesse caído ontem à noite e o celular ficasse guardado.
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('organiza-demo-db'));
    const espeto = db.produtos.find((p) => p.nome === 'Espeto de carne');
    const envio = {
      chaveEnvio: 'cccccccc-0000-4000-8000-000000000001',
      itens: [{ produto_id: espeto.id, quantidade: 1, observacao: null }],
      linhas: [{ nome: 'Espeto de carne', quantidade: 1, observacao: null }],
      mesa: null,
      identificacao: 'Seu Zé',
      formaPagamento: null,
      resumo: '1× Espeto de carne',
      guardadoEm: new Date(Date.now() - 30 * 3600000).toISOString(),
      erro: null,
    };
    localStorage.setItem('organiza-fila-envio-demo-negocio', JSON.stringify([envio]));
  });
  await page.reload();

  const fila = page.getByRole('region', { name: 'Pedido que não entrou' });
  await expect(fila).toContainText('Pedido de outro dia: confira com o cliente e descarte.');
  await expect(fila).toContainText(/Guardado em \d\d\/\d\d às \d\d:\d\d/);
  await expect(page.getByRole('region', { name: 'Na cozinha' })).toHaveCount(0);
  await fila.getByRole('button', { name: 'Descartar' }).click();
  await expect(fila).toBeHidden();
});
