import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { lerBytesDePlanilha } from '../src/lib/lerPlanilha.js';

// Importar planilha: modelo para baixar, revisão em lista, repetidos e o que
// já está no cardápio para o dono escolher, bebida fora da cozinha.

async function semProblemasDeAcessibilidade(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

async function produtosComEspetaria(page) {
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Espetaria' }).click();
  await expect(page.getByText('Espeto de carne', { exact: true })).toBeVisible();
}

const CSV = [
  'Produto;Preço;Vai para a cozinha?',
  'Espeto de carne;10,00;Sim',
  'Tapioca;8,00;',
  'Tapioca;8,00;',
  'Cuscuz;7,00;',
  'Cuscuz;8,00;',
  'Cerveja long neck;12;',
  'Bolo;;',
].join('\r\n');

test('baixa o modelo, e o próprio Organiza+ lê o arquivo baixado', async ({ page }) => {
  await produtosComEspetaria(page);
  await page.getByRole('button', { name: 'Importar planilha' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar o modelo' }).click()]);
  expect(download.suggestedFilename()).toBe('modelo-cardapio-organiza.xlsx');
  const bytes = new Uint8Array(await readFile(await download.path()));
  expect(await lerBytesDePlanilha(bytes, 'modelo.xlsx')).toEqual([['Produto', 'Tamanho', 'Preço', 'Vai para a cozinha?', 'Custo (se souber)', 'Meio a meio?']]);
});

test('importa a planilha: confere, escolhe os repetidos e salva', async ({ page }) => {
  await produtosComEspetaria(page);
  await page.getByRole('button', { name: 'Importar planilha' }).click();
  const secao = page.getByRole('region', { name: 'Importar planilha' });
  await secao.locator('input[type=file]').setInputFiles({ name: 'meu-cardapio.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8') });

  await expect(secao).toContainText('5 produtos encontrados em meu-cardapio.csv. 1 linha repetida igual entra uma vez só.');
  const atencao = secao.getByRole('region', { name: /^Confira estes primeiro \(3\)/ });
  const prontos = secao.getByRole('region', { name: /^Prontos para entrar \(2\)/ });
  await expect(atencao.getByRole('group', { name: '"Espeto de carne" já está no cardápio por R$ 9,00.' })).toBeVisible();
  await expect(atencao.getByRole('group', { name: /"Cuscuz" aparece 2 vezes/ })).toBeVisible();
  await expect(atencao.getByLabel('Preço (R$)')).toHaveValue('');
  await expect(prontos.getByText('Linha 3 (repetida igual na 4)')).toBeVisible();
  // Bebida: entra na conta, fora da fila da cozinha.
  const cozinhaDaCerveja = prontos.getByRole('listitem').filter({ has: page.getByLabel('Importar Cerveja long neck') }).getByLabel(/Vai para a cozinha/);
  await expect(cozinhaDaCerveja).not.toBeChecked();
  await expect(prontos).toContainText('Parece bebida');
  await semProblemasDeAcessibilidade(page);

  // Salvar sem resolver: aponta o que falta.
  await expect(secao.getByRole('button', { name: 'Salvar: 3 novos' })).toBeVisible();
  await secao.getByRole('button', { name: 'Salvar: 3 novos' }).click();
  await expect(atencao.getByText('Escolha qual linha vale.')).toBeVisible();
  await expect(atencao.getByText('Digite um preço maior que zero, como 12,50.')).toBeVisible();

  await atencao.getByRole('radio', { name: /^Usar a linha 6:/ }).check();
  await atencao.getByLabel('Preço (R$)').last().fill('15');
  await atencao.getByRole('radio', { name: /^Usar o da planilha 2:/ }).check();
  await secao.getByRole('button', { name: 'Salvar: 4 novos e 1 atualizado' }).click();

  await expect(page.getByText('4 produtos novos entraram no cardápio. 1 produto foi atualizado.')).toBeVisible();
  await expect(secao).toHaveCount(0);
  const cartao = (nome) => page.getByRole('listitem').filter({ has: page.getByText(nome, { exact: true }) });
  await expect(cartao('Espeto de carne')).toContainText('R$ 10,00');
  await expect(cartao('Cuscuz')).toContainText('R$ 8,00');
  await expect(cartao('Bolo')).toContainText('R$ 15,00');
  await expect(cartao('Cerveja long neck')).toContainText('Sem cozinha');
  await expect(page.getByText('Tapioca', { exact: true })).toHaveCount(1);

  // A mesma planilha de novo: tudo já existe, nada duplica.
  await page.getByRole('button', { name: 'Importar planilha' }).click();
  await secao.locator('input[type=file]').setInputFiles({ name: 'meu-cardapio.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8') });
  await expect(secao.getByRole('region', { name: /^Confira estes primeiro \(5\)/ })).toBeVisible();
  await expect(secao.getByRole('button', { name: 'Nada marcado para salvar' })).toBeDisabled();
});

test('arquivo que não é planilha explica o que fazer', async ({ page }) => {
  await produtosComEspetaria(page);
  await page.getByRole('button', { name: 'Importar planilha' }).click();
  const secao = page.getByRole('region', { name: 'Importar planilha' });
  const entrada = secao.locator('input[type=file]');
  await entrada.setInputFiles({ name: 'velho.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]) });
  await expect(secao).toContainText('formato antigo do Excel (.xls)');
  await entrada.setInputFiles({ name: 'vazia.csv', mimeType: 'text/csv', buffer: Buffer.from('Produto;Preço\r\n') });
  await expect(secao).toContainText('Não achei produtos nessa planilha');
  await semProblemasDeAcessibilidade(page);
});
