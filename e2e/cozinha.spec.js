import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { lancarPedido, montarEspetaria } from './ajuda';

// Cozinha: som forte só com a fila vazia, "tic" com pedido na tela, nada no
// "Pronto" do cozinheiro; a faixa "+N pedidos novos"; o modo foco; e o aviso
// de pedido que chegou com outro app na frente.
// O "aparelho da cozinha" é outra aba; o som é gravado por um AudioContext de
// mentira (só as notas tocadas): novo = 880, 1108.73, 1318.51 (duas vezes),
// tic = 660, aviso = 880, 880.

const NOVO = [880, 1108.73, 1318.51, 880, 1108.73, 1318.51];

async function gravarSom(context) {
  await context.addInitScript(() => {
    window.__notas = [];
    class Parametro {
      value = 0;
      setValueAtTime() {}
      exponentialRampToValueAtTime() {}
    }
    class No {
      connect(destino) {
        return destino;
      }
    }
    class ContextoDeMentira {
      state = 'running';
      currentTime = 0;
      destination = new No();
      resume() {
        return Promise.resolve();
      }
      createGain() {
        const g = new No();
        g.gain = new Parametro();
        return g;
      }
      createOscillator() {
        const o = new No();
        o.frequency = new Parametro();
        o.start = () => window.__notas.push(Math.round(o.frequency.value * 100) / 100);
        o.stop = () => {};
        return o;
      }
    }
    window.AudioContext = ContextoDeMentira;
  });
}

// Devolve as notas tocadas desde a última leitura.
const notas = (pagina) => pagina.evaluate(() => window.__notas.splice(0));

async function abrirCozinha(context, viewport) {
  const cozinha = await context.newPage();
  if (viewport) await cozinha.setViewportSize(viewport);
  await cozinha.goto('/cozinha');
  // Com a tela baixa (celular deitado) o título some; as abas ficam.
  await expect(cozinha.getByRole('group', { name: 'O que mostrar' })).toBeVisible();
  return cozinha;
}

// Liga o som (se o navegador ainda pedir o toque) e abre "Som e tela".
async function abrirAjustes(cozinha) {
  const ligar = cozinha.getByRole('button', { name: 'Toque aqui para ligar o som dos pedidos novos' });
  if (await ligar.isVisible()) await ligar.click();
  await cozinha.getByRole('button', { name: 'Som e tela' }).click();
}

const cartoes = (cozinha) => cozinha.getByRole('list', { name: 'Fila de pedidos' }).getByRole('listitem').filter({ has: cozinha.getByRole('button', { name: 'Pronto' }) });

test('som: forte com a fila vazia, tic com pedido na tela, nada no Pronto, aviso no cancelado', async ({ page, context }) => {
  await gravarSom(context);
  await montarEspetaria(page);
  const cozinha = await abrirCozinha(context);
  // Aberta por outra aba, o navegador pode já ter liberado o som.
  await abrirAjustes(cozinha);
  await expect(cozinha.getByText('Som ligado')).toBeVisible();
  await expect(cozinha.getByText('O volume é o do aparelho: tire do silencioso e deixe o volume alto.')).toBeVisible();
  await notas(cozinha);

  const primeiro = await lancarPedido(page, ['Espeto de carne']);
  await expect(cartoes(cozinha)).toHaveCount(1);
  await expect.poll(() => notas(cozinha)).toEqual(NOVO);

  await lancarPedido(page, ['Espeto de frango']);
  await expect(cartoes(cozinha)).toHaveCount(2);
  await expect.poll(() => notas(cozinha)).toEqual([660]);

  // Outro logo em seguida: menos de 30 s depois do último, fica em silêncio.
  await lancarPedido(page, ['Espeto de linguiça']);
  await expect(cartoes(cozinha)).toHaveCount(3);
  await cozinha.waitForTimeout(500);
  expect(await notas(cozinha)).toEqual([]);

  // O "Pronto" do próprio cozinheiro não toca.
  await cozinha.getByRole('listitem', { name: `Pedido ${primeiro}` }).getByRole('button', { name: 'Pronto' }).click();
  await expect(cartoes(cozinha)).toHaveCount(2);
  await cozinha.waitForTimeout(500);
  expect(await notas(cozinha)).toEqual([]);

  // Cancelado sempre avisa (dois bipes), mesmo logo depois de outro som.
  await page.goto('/pedidos');
  const naFila = page.getByRole('listitem').filter({ hasText: '1× Espeto de frango' });
  await naFila.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await naFila.getByRole('button', { name: 'Lançado errado' }).click();
  await naFila.getByRole('button', { name: 'Sim, devolvi' }).click();
  await expect(cartoes(cozinha)).toHaveCount(1);
  await expect.poll(() => notas(cozinha)).toEqual([880, 880]);
});

test('"+N pedidos novos": conta só o que está fora da tela e leva até eles', async ({ page, context }) => {
  await montarEspetaria(page);
  const cozinha = await abrirCozinha(context, { width: 360, height: 640 });
  const faixa = cozinha.getByRole('button', { name: /^\+\d+ pedidos? novos?$/ });

  for (const nome of ['Espeto de carne', 'Espeto de frango', 'Espeto de linguiça', 'Espeto de queijo coalho']) {
    await lancarPedido(page, [nome]);
  }
  await expect(cartoes(cozinha)).toHaveCount(4);
  await expect(faixa).toBeVisible();
  await expect(cozinha.getByRole('list', { name: 'Fila de pedidos' })).toBeVisible();

  // Cada toque leva ao próximo novo; quando todos apareceram, a faixa some.
  for (let i = 0; i < 6 && (await faixa.count()); i++) {
    await faixa.click();
    await cozinha.waitForTimeout(700);
  }
  await expect(faixa).toHaveCount(0);

  // Com a tela de cima (nada fora da tela), um pedido novo que aparece não conta.
  await cozinha.setViewportSize({ width: 1366, height: 1400 });
  await cozinha.evaluate(() => window.scrollTo(0, 0));
  await lancarPedido(page, ['Baião de dois']);
  await expect(cartoes(cozinha)).toHaveCount(5);
  await cozinha.waitForTimeout(500);
  await expect(faixa).toHaveCount(0);
});

test('modo foco: a cozinha escolhe quantos pedidos ver, o resto vira "+N na fila"', async ({ page, context }) => {
  await montarEspetaria(page);
  for (const nome of ['Espeto de carne', 'Espeto de frango', 'Espeto de linguiça']) {
    await lancarPedido(page, [nome]);
  }
  const cozinha = await abrirCozinha(context);
  // Os ajustes ficam fechados: no celular a fila aparece sem rolar.
  await expect(cozinha.getByRole('group', { name: 'Pedidos na tela' })).toHaveCount(0);
  await abrirAjustes(cozinha);
  const escolha = cozinha.getByRole('group', { name: 'Pedidos na tela' });
  // Padrão: todos.
  await expect(escolha.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
  await expect(cartoes(cozinha)).toHaveCount(3);

  await escolha.getByRole('button', { name: '1 por vez' }).click();
  await expect(cartoes(cozinha)).toHaveCount(1);
  await expect(cartoes(cozinha)).toContainText('Espeto de carne');
  await expect(cozinha.getByText('+2 na fila')).toBeVisible();
  const { violations } = await new AxeBuilder({ page: cozinha }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  // Pedido novo entra no "+N na fila" e é contado como novo.
  await lancarPedido(page, ['Baião de dois']);
  await expect(cozinha.getByText('+3 na fila (1 novo)')).toBeVisible();

  // Pronto: o próximo aparece.
  await cartoes(cozinha).getByRole('button', { name: 'Pronto' }).click();
  await expect(cartoes(cozinha)).toContainText('Espeto de frango');
  await expect(cozinha.getByText('+2 na fila (1 novo)')).toBeVisible();

  // A escolha fica guardada neste aparelho.
  await cozinha.reload();
  await expect(cozinha.getByText(/Som ligado.* · 1 por vez/)).toBeVisible();
  await abrirAjustes(cozinha);
  await expect(escolha.getByRole('button', { name: '1 por vez' })).toHaveAttribute('aria-pressed', 'true');
  await escolha.getByRole('button', { name: '2 por vez' }).click();
  await expect(cartoes(cozinha)).toHaveCount(2);
  await expect(cozinha.getByText('+1 na fila')).toBeVisible();
  await escolha.getByRole('button', { name: 'Todos' }).click();
  await expect(cartoes(cozinha)).toHaveCount(3);
  await expect(cozinha.getByText(/na fila$/)).toHaveCount(0);
});

test('pedido que chega com outro app na frente: avisa quando a pessoa volta', async ({ page, context }) => {
  await montarEspetaria(page);
  const cozinha = await abrirCozinha(context);
  const mudarVisibilidade = (estado) =>
    cozinha.evaluate((e) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => e });
      document.dispatchEvent(new Event('visibilitychange'));
    }, estado);

  await mudarVisibilidade('hidden');
  await lancarPedido(page, ['Espeto de carne']);
  await expect(cartoes(cozinha)).toHaveCount(1);
  await mudarVisibilidade('visible');

  const aviso = cozinha.getByText('Chegou 1 pedido enquanto outro app estava na frente');
  await expect(aviso).toBeVisible();
  await cozinha.getByRole('button', { name: 'Entendi' }).click();
  await expect(aviso).toHaveCount(0);
});
