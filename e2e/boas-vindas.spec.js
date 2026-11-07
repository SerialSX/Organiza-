import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cadastrarProduto, enviar, escolherMesa } from './ajuda';

// Perguntas de boas-vindas: obrigatórias na primeira vez que o dono entra.

async function semProblemasDeAcessibilidade(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

// A demonstração já vem respondida; aqui o negócio volta a "não respondeu"
// (como um negócio recém-cadastrado: sem modo, sem mesas, sem taxa).
async function negocioNovo(page) {
  await page.goto('/ajuda');
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('organiza-demo-db') ?? '{}');
    localStorage.setItem('organiza-demo-db', JSON.stringify({ ...db, perfil: { ...db.perfil, modo_atendimento: null, quantidade_mesas: null, taxa_servico: null } }));
  });
}

async function passarTutorial(page, rotuloFim) {
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Próximo →' }).click();
  await page.getByRole('button', { name: `${rotuloFim} ✓` }).click();
}

test('balcão com aparelho na cozinha: responde, vê o passo a passo e testa a cozinha', async ({ page, context }) => {
  await negocioNovo(page);
  await page.goto('/pedidos');

  // Sem responder, nenhuma tela do painel abre, nem o menu aparece.
  await expect(page.getByRole('heading', { name: 'Como você atende seus clientes?', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Usar este jeito' })).toBeDisabled();
  await semProblemasDeAcessibilidade(page);

  await page.getByText('O cliente pede, paga e espera ficar pronto').click();
  await page.getByRole('button', { name: 'Usar este jeito' }).click();

  await expect(page.getByText('Balcão · Passo 1 de 4')).toBeVisible();
  await semProblemasDeAcessibilidade(page);
  await passarTutorial(page, 'Entendi, continuar');

  await expect(page.getByRole('heading', { name: 'Quem prepara os pedidos fica longe de você?' })).toBeVisible();
  await page.getByText('Sim, quero um aparelho na cozinha').click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Como ligar o aparelho da cozinha' })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR code que abre a tela de entrar/ })).toBeVisible();
  await semProblemasDeAcessibilidade(page);

  // O "aparelho da cozinha" é outra aba com a Cozinha aberta.
  const cozinha = await context.newPage();
  await cozinha.goto('/cozinha');
  await expect(cozinha.getByRole('heading', { name: 'Cozinha' })).toBeVisible();
  await page.getByRole('button', { name: 'Fiz tudo, testar agora' }).click();
  await expect(cozinha.getByText('Teste recebido! Está tudo certo')).toBeVisible();
  await expect(page.getByText('A cozinha recebeu o teste. Está tudo certo!')).toBeVisible();
  // O teste não vira pedido.
  await expect(cozinha.getByText('Nenhum pedido para preparar')).toBeVisible();

  await page.getByRole('button', { name: 'Começar a usar' }).click();
  await expect(page.getByRole('heading', { name: 'Novo pedido' })).toBeVisible();
  // Só balcão: não pergunta balcão ou mesa a cada pedido.
  await cadastrarProduto(page, 'Tapioca', '7');
  await page.goto('/pedidos');
  await page.getByRole('button', { name: /^Adicionar Tapioca,/ }).click();
  await expect(page.getByText('Para onde vai o pedido?')).toHaveCount(0);
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' })).toBeVisible();

  // Respondido: nas próximas vezes entra direto.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Novo pedido' })).toBeVisible();
});

test('só mesa, tudo num aparelho: sem senha, sem QR e sem pagamento na hora do pedido', async ({ page }) => {
  await negocioNovo(page);
  await page.goto('/home');
  await page.getByText('O cliente senta, vai pedindo e paga tudo no final').click();
  await page.getByRole('button', { name: 'Usar este jeito' }).click();
  await expect(page.getByText('Mesa · Passo 1 de 4')).toBeVisible();
  await passarTutorial(page, 'Entendi, continuar');

  // Quem atende na mesa responde também as mesas e a taxa de serviço.
  await expect(page.getByRole('heading', { name: 'Quantas mesas você tem?' })).toBeVisible();
  await expect(page.getByText('Pergunta 2 de 4')).toBeVisible();
  await expect(page.getByLabel('Quantas mesas você tem?')).toHaveValue('8');
  await page.getByRole('button', { name: 'Uma mesa a menos' }).click();
  await page.getByRole('button', { name: 'Uma mesa a menos' }).click();
  await semProblemasDeAcessibilidade(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Você cobra a taxa de serviço?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await page.getByText('Sim, cobro').click();
  await expect(page.getByLabel('Quanto é a taxa de serviço (%)')).toHaveValue('10');
  await page.getByText('Não cobro').click();
  await semProblemasDeAcessibilidade(page);
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByText('Pergunta 4 de 4')).toBeVisible();
  await page.getByText('Não, eu mesmo preparo ou a cozinha fica do meu lado').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Certo! Tudo num aparelho só' })).toBeVisible();
  await expect(page.getByText('e leve até a mesa.')).toBeVisible();
  await page.getByRole('button', { name: 'Entendi, começar' }).click();

  // Sem tela de cozinha no menu e sem página do QR code.
  await expect(page.getByRole('navigation', { name: 'Principal' }).first().getByRole('link', { name: 'Cozinha' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Página do cliente/ })).toHaveCount(0);

  await cadastrarProduto(page, 'Espeto de carne', '8');
  await page.goto('/pedidos');
  await page.getByRole('button', { name: /^Adicionar Espeto de carne,/ }).click();
  await expect(page.getByText('Para onde vai o pedido?')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Como o cliente pagou?' })).toHaveCount(0);
  // 6 mesas no mapa, como respondido.
  await expect(page.getByRole('region', { name: 'Mesas', exact: true }).getByRole('button', { name: /^Mesa \d+, livre/ })).toHaveCount(6);
  await escolherMesa(page, 3);
  await enviar(page);
  const aviso = page.getByRole('status').filter({ hasText: 'Entrou na conta da mesa.' });
  await expect(aviso).toContainText('Mesa 3');
  await expect(aviso).not.toContainText('senha');
});

test('conta antiga que atende na mesa responde só as mesas e a taxa', async ({ page }) => {
  await page.goto('/ajuda');
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('organiza-demo-db') ?? '{}');
    localStorage.setItem(
      'organiza-demo-db',
      JSON.stringify({ ...db, perfil: { ...db.perfil, modo_atendimento: 'mesa', quantidade_mesas: null, taxa_servico: null } }),
    );
  });
  await page.goto('/pedidos');
  await expect(page.getByRole('heading', { name: 'Quantas mesas você tem?' })).toBeVisible();
  await expect(page.getByText('Novidade: mapa das mesas · Pergunta 1 de 2')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);
  await page.getByLabel('Quantas mesas você tem?').fill('12');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByText('Sim, cobro').click();
  await page.getByRole('button', { name: 'Aumentar a taxa' }).click();
  await page.getByRole('button', { name: 'Aumentar a taxa' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Pronto! Suas mesas estão no mapa' })).toBeVisible();
  await semProblemasDeAcessibilidade(page);
  await page.getByRole('button', { name: 'Entendi, começar' }).click();
  await expect(page.getByRole('heading', { name: 'Novo pedido' })).toBeVisible();

  await page.goto('/minha-conta');
  await expect(page.getByLabel('Quantas mesas você tem?')).toHaveValue('12');
  await expect(page.getByLabel('Quanto é a taxa de serviço (%)')).toHaveValue('12');
  // Respondido: entra direto.
  await page.goto('/pedidos');
  await expect(page.getByRole('heading', { name: 'Novo pedido' })).toBeVisible();
});

test('dá para trocar a resposta antes de continuar e depois em Minha conta', async ({ page }) => {
  await negocioNovo(page);
  await page.goto('/home');
  await page.getByText('Tenho os dois tipos de cliente').click();
  await page.getByRole('button', { name: 'Usar este jeito' }).click();
  await page.getByRole('button', { name: '← Trocar a resposta' }).click();
  await page.getByText('O cliente pede, paga e espera ficar pronto').click();
  await page.getByRole('button', { name: 'Usar este jeito' }).click();
  await expect(page.getByText('Balcão · Passo 1 de 4')).toBeVisible();
  await passarTutorial(page, 'Entendi, continuar');
  await page.getByText('Sim, quero um aparelho na cozinha').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Faço isso depois' }).click();

  await page.goto('/minha-conta');
  await expect(page.getByRole('radio', { name: /^Balcão O cliente pede/ })).toBeChecked();
  await page.getByText('Tenho os dois tipos de cliente').click();
  // Passou a atender na mesa: responde as mesas e a taxa antes de salvar.
  await expect(page.getByRole('button', { name: 'Salvar' }).last()).toBeDisabled();
  await expect(page.getByLabel('Quantas mesas você tem?')).toHaveValue('8');
  await page.getByText('Não cobro').click();
  await page.getByRole('button', { name: 'Salvar' }).last().click();
  await expect(page.getByText('Salvo.')).toBeVisible();
  await semProblemasDeAcessibilidade(page);

  await cadastrarProduto(page, 'Tapioca', '7');
  await page.goto('/pedidos');
  await page.getByRole('button', { name: /^Adicionar Tapioca,/ }).click();
  await expect(page.getByText('Para onde vai o pedido?')).toBeVisible();
});

test('a Ajuda guarda os passo a passos e o guia da cozinha', async ({ page }) => {
  await page.goto('/ajuda#como-funciona');
  const comoFunciona = page.getByRole('region', { name: 'Veja como funciona' });
  await expect(comoFunciona.getByText('Balcão e mesa · Passo 1 de 4')).toBeVisible();
  await comoFunciona.getByRole('button', { name: 'Mesa', exact: true }).click();
  await expect(comoFunciona.getByText('Mesa · Passo 1 de 4')).toBeVisible();
  await page.getByText('Como ligar o aparelho da cozinha').click();
  await expect(page.getByRole('button', { name: 'Fiz tudo, testar agora' })).toBeVisible();
  await semProblemasDeAcessibilidade(page);
});
