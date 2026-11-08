import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Confiança: o "Travou?" sempre à vista, o aviso de navegador de dentro de
// outro app, o ícone na tela do celular e as perguntas antes de criar a conta.
// (A internet caindo está em revisao-pr32.spec.js e validacao-de-campo.spec.js.)

async function semProblemasDeAcessibilidade(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

const INSTAGRAM_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0.1 Android';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

test('"Travou?" fica no topo de toda tela e leva aos 3 passos', async ({ page }) => {
  await page.goto('/pedidos');
  await page.getByRole('link', { name: 'Travou?', exact: true }).click();
  await expect(page).toHaveURL(/\/ajuda#travou$/);
  const secao = page.getByRole('region', { name: 'Travou? Veja o que fazer' });
  await expect(secao).toBeInViewport();
  await expect(secao).toContainText('Puxe a tela para baixo');
  await expect(secao).toContainText('Não lance de novo.');
  await expect(secao).toContainText('Anote no papel por enquanto');
  await expect(secao.getByRole('link', { name: 'Mandar e-mail' })).toBeVisible();

  // No rodapé das telas do sistema também.
  await page.goto('/caixa');
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Travou? Veja o que fazer' })).toBeVisible();
});

test('aberto dentro do Instagram: avisa como abrir no Chrome, menos na página do cliente', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: INSTAGRAM_ANDROID, viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  await page.goto('/login');
  const aviso = page.getByRole('region', { name: 'Aviso sobre o navegador' });
  await expect(aviso).toContainText('Você abriu o Organiza+ dentro do Instagram');
  await expect(aviso).toContainText('"Abrir no Chrome"');
  await semProblemasDeAcessibilidade(page);

  await page.goto('/p/demonstracao');
  await expect(page.getByRole('region', { name: 'Aviso sobre o navegador' })).toHaveCount(0);

  await page.goto('/login');
  await aviso.getByRole('button', { name: 'Entendi' }).click();
  await expect(aviso).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Aviso sobre o navegador' })).toHaveCount(0);
  await context.close();
});

test('no Chrome de verdade não aparece aviso de navegador', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Aviso sobre o navegador' })).toHaveCount(0);
});

test('criar conta responde as perguntas de quem ainda está decidindo', async ({ page }) => {
  await page.goto('/cadastro');
  const perguntas = page.getByRole('region', { name: 'Perguntas que todo mundo faz antes de começar' });
  await expect(perguntas).toBeVisible();
  for (const p of ['Quanto custa?', 'Preciso comprar alguma coisa?', 'Quem cadastra o cardápio?', 'E se a internet cair?', 'Vou ter que largar o papel de uma vez?', 'E os meus dados?']) {
    await expect(perguntas.getByText(p, { exact: true })).toBeVisible();
  }
  await expect(perguntas).toContainText('projeto de estudantes da Unifor');
  await semProblemasDeAcessibilidade(page);
});

// Fim das boas-vindas num celular: o passo opcional do ícone.
async function terminarBoasVindas(page) {
  await page.goto('/ajuda');
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('organiza-demo-db') ?? '{}');
    localStorage.setItem('organiza-demo-db', JSON.stringify({ ...db, perfil: { ...db.perfil, modo_atendimento: null, quantidade_mesas: null, taxa_servico: null } }));
  });
  await page.goto('/home');
  await page.getByText('O cliente pede, paga e espera ficar pronto').click();
  await page.getByRole('button', { name: 'Usar este jeito' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Próximo →' }).click();
  await page.getByRole('button', { name: 'Entendi, continuar ✓' }).click();
  await page.getByText('Não, eu mesmo preparo ou a cozinha fica do meu lado').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Entendi, começar' }).click();
}

test('celular Android: no fim das boas-vindas, coloca o Organiza+ na tela com um toque', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'o passo aparece só em celular e tablet');
  await terminarBoasVindas(page);
  await expect(page.getByRole('heading', { name: 'Deixe o Organiza+ na tela do seu celular' })).toBeVisible();
  // Sem o aviso do Chrome ainda: mostra o caminho pelo menu.
  await expect(page.getByText('Adicionar à tela inicial')).toBeVisible();
  await semProblemasDeAcessibilidade(page);

  // O Chrome avisa que dá para instalar: aparece o botão de um toque.
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt');
    e.prompt = async () => {};
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await page.getByRole('button', { name: 'Colocar na tela do celular' }).click();
  await expect(page.getByText('Pronto: o Organiza+ está na tela do seu celular.')).toBeVisible();
  await page.getByRole('button', { name: 'Começar a usar' }).click();
  await expect(page.getByRole('heading', { name: /^Meu negócio/ })).toBeVisible();
});

test('celular: "Agora não" pula o passo, e ele fica na Ajuda', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'o passo aparece só em celular e tablet');
  await terminarBoasVindas(page);
  await page.getByRole('button', { name: 'Agora não' }).click();
  await expect(page.getByRole('heading', { name: /^Meu negócio/ })).toBeVisible();

  await page.goto('/ajuda#tela-do-celular');
  await expect(page.getByText('O ícone do Organiza+ fica junto com o WhatsApp')).toBeVisible();
});

test('computador: as boas-vindas terminam sem o passo do celular', async ({ page }, info) => {
  test.skip(info.project.name !== 'computador', 'só no computador');
  await terminarBoasVindas(page);
  await expect(page.getByRole('heading', { name: /^Meu negócio/ })).toBeVisible();
});

test('iPhone: a Ajuda mostra o passo a passo do Safari', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: SAFARI_IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/ajuda#tela-do-celular');
  const passo = page.locator('#tela-do-celular');
  await expect(passo).toContainText('Adicionar à Tela de Início');
  await expect(passo).toContainText('ícone de compartilhar');
  await context.close();
});
