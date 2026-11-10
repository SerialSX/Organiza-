import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { enviar } from './ajuda';

// Meio a meio: a regra do dono, os sabores marcados, a escolha no pedido, a
// cozinha com uma linha para cada metade, a edição e o relatório.

async function semProblemasDeAcessibilidade(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

const cartao = (page, nome) => page.getByRole('listitem').filter({ has: page.getByText(nome, { exact: true }) });

test('pizzaria pronta: escolhe a regra, vende meio a meio e a cozinha vê as duas metades', async ({ page, context }) => {
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Pizzaria' }).click();
  await expect(cartao(page, 'Pizza Calabresa')).toContainText('Meio a meio');
  await expect(cartao(page, 'Refrigerante lata')).not.toContainText('Meio a meio');

  // Os sabores vieram marcados e o dono ainda não disse como cobra.
  const aviso = page.getByRole('region', { name: 'Falta escolher como cobrar o meio a meio' });
  await aviso.getByRole('button', { name: 'Salvar' }).click();
  await expect(aviso.getByText('Escolha como você cobra o meio a meio.')).toBeVisible();
  await aviso.getByLabel(/Pela média dos dois/).check();
  await semProblemasDeAcessibilidade(page);
  await aviso.getByRole('button', { name: 'Salvar' }).click();
  await expect(aviso).toHaveCount(0);

  await page.goto('/pedidos');
  await page.getByRole('button', { name: 'Pizza Calabresa meio a meio' }).click();
  const janela = page.getByRole('dialog', { name: 'Pizza Calabresa meio a meio' });
  await janela.getByRole('button', { name: 'Tamanho G' }).click();
  // Pela média: (55 + 58) / 2.
  await expect(janela.getByRole('button', { name: 'Adicionar G: ½ Pizza Calabresa + ½ Pizza Portuguesa, R$ 56,50' })).toBeVisible();
  // Refrigerante não é sabor.
  await expect(janela.getByText(/Refrigerante/)).toHaveCount(0);
  await semProblemasDeAcessibilidade(page);
  await janela.getByRole('button', { name: 'Adicionar G: ½ Pizza Calabresa + ½ Pizza Portuguesa, R$ 56,50' }).click();
  await expect(janela).toHaveCount(0);

  const carrinho = page.getByRole('complementary', { name: 'Pedido' });
  await expect(carrinho.getByText('G: ½ Pizza Calabresa + ½ Pizza Portuguesa')).toBeVisible();
  await expect(carrinho).toContainText('R$ 56,50');
  await expect(page.getByRole('button', { name: 'Pizza Calabresa meio a meio, 1 no pedido' })).toBeVisible();
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible();

  const cozinha = await context.newPage();
  await cozinha.goto('/cozinha');
  await expect(cozinha.getByLabel('tamanho G')).toBeVisible();
  await expect(cozinha.getByText('Meio a meio', { exact: true })).toBeVisible();
  await expect(cozinha.getByText('½ Pizza Calabresa', { exact: true })).toBeVisible();
  await expect(cozinha.getByText('½ Pizza Portuguesa', { exact: true })).toBeVisible();

  // Cada sabor conta meia no relatório.
  await page.goto('/relatorios');
  await expect(page.getByText('0,5 unidade').first()).toBeVisible();
});

test('marca o primeiro sabor no cadastro com a regra junto; sabor esgotado aparece riscado; editar mantém o preço', async ({ page }) => {
  await page.goto('/produtos');
  const novo = async (nome, preco) => {
    await page.getByRole('button', { name: /^(Cadastrar o primeiro produto|Novo produto)$/ }).click();
    const form = page.getByRole('form', { name: 'Novo produto' });
    await form.getByLabel('Nome', { exact: true }).fill(nome);
    await form.getByLabel('Preço de venda (R$)').fill(preco);
    await form.getByLabel('Pode ser meio a meio').check();
    return form;
  };

  let form = await novo('Broto de frango', '20');
  await semProblemasDeAcessibilidade(page);
  await form.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(form.getByText('Escolha como você cobra o meio a meio.')).toBeVisible();
  await form.getByLabel(/Pelo sabor mais caro/).check();
  await form.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(cartao(page, 'Broto de frango')).toContainText('Meio a meio');

  // A regra já foi escolhida: o segundo sabor não pergunta de novo.
  form = await novo('Broto de milho', '24');
  await expect(form.getByText('Como você cobra o meio a meio?')).toHaveCount(0);
  await form.getByRole('button', { name: 'Salvar produto' }).click();
  form = await novo('Broto de carne', '26');
  await form.getByRole('button', { name: 'Salvar produto' }).click();
  await page.getByRole('switch', { name: 'Broto de carne disponível' }).click();

  await page.goto('/pedidos');
  await page.getByRole('button', { name: 'Broto de frango meio a meio' }).click();
  const janela = page.getByRole('dialog', { name: 'Broto de frango meio a meio' });
  // Sem tamanhos, vai direto para a outra metade. Mais caro: R$ 24,00.
  const esgotado = janela.getByRole('button', { name: 'Broto de carne, esgotado' });
  await expect(esgotado).toHaveAttribute('aria-disabled', 'true');
  await esgotado.click({ force: true });
  await expect(page.getByText('Broto de carne está esgotado. Ofereça outra opção ao cliente.')).toBeVisible();
  await page.getByRole('button', { name: 'Broto de frango meio a meio' }).click();
  await page.getByRole('button', { name: 'Adicionar ½ Broto de frango + ½ Broto de milho, R$ 24,00' }).click();
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible();

  // O dono muda a regra: o pedido feito continua com o preço combinado.
  await page.goto('/minha-conta');
  const secao = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Meio a meio', exact: true }) });
  await secao.getByLabel(/Pela média dos dois/).check();
  await secao.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/Vale para os pedidos novos/)).toBeVisible();

  await page.goto('/pedidos');
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  const carrinho = page.getByRole('complementary', { name: /^Pedido/ });
  await expect(carrinho.getByText('½ Broto de frango + ½ Broto de milho')).toBeVisible();
  await expect(carrinho).toContainText('R$ 24,00');
  // Pedido novo já sai pela média.
  await page.getByRole('button', { name: 'Sair sem salvar' }).click();
  await page.getByRole('button', { name: 'Broto de frango meio a meio' }).click();
  await page.getByRole('button', { name: 'Adicionar ½ Broto de frango + ½ Broto de milho, R$ 22,00' }).click();
  await expect(page.getByRole('complementary', { name: 'Pedido' })).toContainText('R$ 22,00');
});
