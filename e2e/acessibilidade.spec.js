import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TELAS = ['/', '/login', '/cadastro', '/esqueci-senha', '/privacidade', '/home', '/produtos', '/pedidos', '/cozinha', '/relatorios', '/pagina-do-cliente', '/minha-conta', '/p/demonstracao'];

for (const tela of TELAS) {
  test(`sem problemas de acessibilidade em ${tela}`, async ({ page }) => {
    await page.goto(tela);
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });
}
