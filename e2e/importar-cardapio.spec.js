import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cadastrarProduto } from './ajuda';

// PNG de 1 pixel: no modo demonstração a foto não é lida de verdade, só
// precisa ser uma imagem que o navegador abre.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function lerFoto(page) {
  await page.getByRole('button', { name: 'Importar do cardápio' }).click();
  await expect(page.getByText(/enviada ao serviço de inteligência artificial do Google/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: 'cardapio.png', mimeType: 'image/png', buffer: PNG });
  const form = page.getByRole('form', { name: 'Importar do cardápio' });
  await expect(form).toBeVisible();
  return form;
}

test('importa os itens da foto, pulando o que já existe', async ({ page }) => {
  await cadastrarProduto(page, 'X-Burguer', '18,50');
  const form = await lerFoto(page);

  // X-Burguer já existe e o suco veio sem preço: os dois começam desmarcados.
  await expect(form.getByText('Já cadastrado')).toBeVisible();
  await expect(form.getByRole('checkbox', { name: 'Importar X-Burguer' })).not.toBeChecked();
  await expect(form.getByRole('checkbox', { name: 'Importar Batata frita' })).toBeChecked();
  await expect(form.getByRole('button', { name: 'Salvar 1 produto' })).toBeVisible();

  const suco = form.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: 'Importar Suco de laranja' }) });
  await expect(suco.getByText('A foto não mostrava o preço.')).toBeVisible();
  await suco.getByLabel('Preço (R$)').fill('8');
  await suco.getByRole('checkbox').check();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);

  await form.getByRole('button', { name: 'Salvar 2 produtos' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 produtos importados do cardápio.' })).toBeVisible();
  await expect(page.getByText('Batata frita', { exact: true })).toBeVisible();
  await expect(page.getByText(/R\$\s8,00/)).toBeVisible();
});

test('não salva item marcado sem preço e mostra o erro nele', async ({ page }) => {
  await page.goto('/produtos');
  const form = await lerFoto(page);
  await form.getByRole('checkbox', { name: 'Importar Suco de laranja' }).check();
  await form.getByRole('button', { name: 'Salvar 3 produtos' }).click();
  await expect(form.getByText('Digite um preço maior que zero, como 12,50.')).toBeVisible();
  await expect(form.getByLabel('Preço (R$)').last()).toBeFocused();
});
