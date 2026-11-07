import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { enviar, escolherMesa, montarEspetaria } from './ajuda';

// Fim do dia: "Encerrar o dia" só com tudo resolvido, a lista do que resolver
// (receber, foi embora sem pagar, cancelar, já foi entregue), a devolução do
// dinheiro de pedido pago e cancelado, as pendências do dia anterior e a
// sugestão de mais mesas.
// A demonstração atende no balcão e na mesa, com 8 mesas e 10% de serviço.
// Espeto de carne R$ 9, Cerveja lata R$ 7.

async function semProblemasDeAcessibilidade(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

async function adicionar(page, nome) {
  await page.getByRole('button', { name: new RegExp(`^Adicionar ${nome},`) }).click();
}

async function naMesa(page, mesa, itens) {
  await escolherMesa(page, mesa);
  for (const nome of itens) await adicionar(page, nome);
  await enviar(page);
  await expect(page.getByRole('status').filter({ hasText: /Entrou na conta da mesa|Pode levar até a mesa/ }).first()).toBeVisible();
}

async function noBalcao(page, itens, forma) {
  await page.getByText('Retira pela senha').click();
  for (const nome of itens) await adicionar(page, nome);
  await enviar(page, { forma });
  await expect(page.getByRole('status').filter({ hasText: 'Diga ao cliente a senha' }).first()).toBeVisible();
}

// Muda o banco da demonstração direto no navegador (dias anteriores).
async function noBancoDaDemo(page, mudar) {
  await page.evaluate(`(() => {
    const db = JSON.parse(localStorage.getItem('organiza-demo-db'));
    const menosDias = (dia, n) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
    (${mudar})(db, menosDias);
    localStorage.setItem('organiza-demo-db', JSON.stringify(db));
  })()`);
}

const lista = (page) => page.getByRole('region', { name: 'Para encerrar o dia, resolva:' });
const cartao = (regiao, texto) => regiao.getByRole('listitem').filter({ hasText: texto });

test('encerrar o dia: bloqueia com pedido aberto, resolve cada caso e mostra o resumo', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await noBalcao(page, ['Espeto de carne'], 'Pix'); // 001: na cozinha, pago
  await naMesa(page, 2, ['Cerveja lata']); // 002: mesa 2, pronto, sem pagar
  await naMesa(page, 5, ['Espeto de carne']); // 003: mesa 5, na cozinha, sem pagar
  await noBalcao(page, ['Cerveja lata'], 'Dinheiro'); // 004: pronto, pago

  await page.goto('/caixa');
  const encerrar = page.getByRole('region', { name: 'Terminou o expediente?' });
  await expect(encerrar).toContainText('4 pedidos estão em aberto');
  await encerrar.getByRole('button', { name: 'Encerrar o dia' }).click();
  const janela = page.getByRole('dialog', { name: 'Ainda não dá para encerrar' });
  await expect(janela).toContainText('Impossível encerrar: 4 pedidos em aberto');
  await janela.getByRole('button', { name: 'Ver e resolver' }).click();

  await expect(page).toHaveURL(/\/pedidos\?resolver=\d{4}-\d{2}-\d{2}$/);
  await expect(lista(page)).toContainText('Sem receber (2 contas)');
  await expect(lista(page)).toContainText('Sem marcar como entregue (2)');
  await semProblemasDeAcessibilidade(page);

  // Mesa 2: recebe agora (conta com a taxa de serviço).
  await cartao(lista(page), 'Mesa 2').getByRole('button', { name: 'Receber agora' }).click();
  const fechar = page.getByRole('dialog', { name: 'Fechar a Mesa 2' });
  await fechar.getByText('Um pagou tudo').click();
  await fechar.getByRole('group', { name: /^Receber/ }).getByRole('button', { name: 'Pix' }).click();
  await expect(lista(page)).toContainText('Mesa 2: conta de R$ 7,70 recebida.');

  // Mesa 5: foi embora sem pagar (pede confirmação).
  await cartao(lista(page), 'Mesa 5').getByRole('button', { name: 'Foi embora sem pagar' }).click();
  await expect(cartao(lista(page), 'Mesa 5')).toContainText('O cliente foi embora sem pagar R$ 9,00?');
  await cartao(lista(page), 'Mesa 5').getByRole('button', { name: 'Sim, foi embora sem pagar' }).click();
  await expect(lista(page)).not.toContainText('Mesa 5');

  // 001 pago e na cozinha: cancela e diz que ainda vai devolver.
  await cartao(lista(page), '001').getByRole('button', { name: 'Cancelar' }).click();
  await cartao(lista(page), '001').getByRole('button', { name: 'Cliente desistiu' }).click();
  await expect(cartao(lista(page), '001')).toContainText('O cliente já pagou. Você devolveu o dinheiro?');
  await cartao(lista(page), '001').getByRole('button', { name: 'Ainda vou devolver' }).click();

  // 004 pronto: já foi entregue.
  await cartao(lista(page), '004').getByRole('button', { name: 'Já foi entregue' }).click();

  await expect(lista(page)).toHaveCount(0);
  await expect(page.getByText('Tudo resolvido. Agora dá para encerrar o dia.')).toBeVisible();
  await page.getByRole('link', { name: 'Ir para o Caixa e encerrar o dia' }).click();

  await page.getByRole('region', { name: 'Terminou o expediente?' }).getByRole('button', { name: 'Encerrar o dia' }).click();
  const confirmar = page.getByRole('dialog', { name: 'Encerrar o dia de hoje?' });
  await expect(confirmar).toContainText('Todos os pedidos foram entregues e recebidos.');
  await semProblemasDeAcessibilidade(page);
  await confirmar.getByRole('button', { name: 'Encerrar o dia' }).click();
  await expect(page.getByRole('heading', { name: /^Dia encerrado às \d{2}:\d{2}$/ })).toBeVisible();

  // Resumo da noite: o dinheiro a devolver e o não recebido ficam à parte.
  const aDevolver = page.getByRole('region', { name: 'A devolver' });
  await expect(aDevolver).toContainText('R$ 9,00');
  const naoRecebido = page.getByRole('region', { name: 'Não recebido' });
  await expect(naoRecebido).toContainText('Mesa 5');
  await expect(naoRecebido).toContainText('R$ 9,00');
  await expect(page.getByRole('region', { name: 'Recebido', exact: true })).toContainText('R$ 14,70');
  await semProblemasDeAcessibilidade(page);

  await aDevolver.getByRole('button', { name: 'Devolvi o dinheiro do pedido 001' }).click();
  await expect(page.getByRole('region', { name: 'A devolver' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Dia encerrado/ })).toBeVisible();

  // O cliente da mesa 5 voltou para pagar: desfaz e o dia reabre.
  await naoRecebido.getByRole('button', { name: 'Desfazer: Mesa 5 não foi embora sem pagar' }).click();
  await expect(page.getByRole('region', { name: 'Terminou o expediente?' })).toContainText('1 pedido está em aberto');

  // Volta para o mapa como conta aberta.
  await page.goto('/pedidos');
  await expect(page.getByRole('region', { name: 'Mesas', exact: true }).getByRole('button', { name: /^Mesa 5, ocupada, R\$ 9,00/ })).toBeVisible();
});

test('pedido novo depois de encerrar reabre o dia', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/caixa');
  await page.getByRole('region', { name: 'Terminou o expediente?' }).getByRole('button', { name: 'Encerrar o dia' }).click();
  await page.getByRole('dialog', { name: 'Encerrar o dia de hoje?' }).getByRole('button', { name: 'Encerrar o dia' }).click();
  await expect(page.getByRole('heading', { name: /^Dia encerrado/ })).toBeVisible();

  await page.goto('/pedidos');
  await noBalcao(page, ['Cerveja lata'], 'Pix');
  await page.goto('/caixa');
  await expect(page.getByRole('region', { name: 'Terminou o expediente?' })).toContainText('1 pedido está em aberto');
});

test('cancelar pedido pago e dizer que devolveu não deixa nada a devolver', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await noBalcao(page, ['Espeto de carne'], 'Crédito');
  const naFila = page.getByRole('listitem').filter({ hasText: '1× Espeto de carne' });
  await naFila.getByRole('button', { name: 'Cancelar' }).click();
  await naFila.getByRole('button', { name: 'Lançado errado' }).click();
  await naFila.getByRole('button', { name: 'Sim, devolvi' }).click();
  await page.goto('/caixa');
  await expect(page.getByRole('region', { name: 'A devolver' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Recebido', exact: true })).toContainText('R$ 0,00');
});

test('pendências do dia anterior: aviso em Pedidos, lista no Início e caixa de ontem não fechado', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await naMesa(page, 4, ['Espeto de carne', 'Cerveja lata']);
  // A virada das 5h passou: o pedido agora é de ontem e continua aberto.
  await noBancoDaDemo(page, (db, menosDias) => {
    for (const p of db.pedidos) {
      p.dia = menosDias(p.dia, 1);
      p.criado_em = `${p.dia}T22:00:00-03:00`;
    }
    db.contador = null;
  });

  await page.goto('/pedidos');
  await expect(page.getByText('Pendências do dia anterior: 1 pedido ficou em aberto (sem entregar ou sem receber).')).toBeVisible();
  // A conta de ontem não fica no mapa de hoje.
  await expect(page.getByRole('region', { name: 'Mesas', exact: true }).getByRole('button', { name: /^Mesa 4, livre/ })).toBeVisible();

  await page.goto('/caixa?dia=ontem');
  const ontem = page.getByRole('region', { name: 'Caixa não fechado' });
  await expect(ontem).toContainText('1 pedido está em aberto');

  await page.goto('/pedidos');
  await page.getByRole('link', { name: 'Ver e resolver' }).click();
  const pendencias = page.getByRole('region', { name: 'Pendências do dia anterior' });
  await expect(pendencias).toBeVisible();
  await expect(pendencias).toContainText(/Pedido de \d{2}\/\d{2}/);
  await expect(pendencias).toContainText('R$ 16,00');
  await semProblemasDeAcessibilidade(page);
  await cartao(pendencias, 'Mesa 4').getByRole('button', { name: 'Cancelar a conta' }).click();
  await cartao(pendencias, 'Mesa 4').getByRole('button', { name: 'Lançado errado' }).click();
  await expect(page.getByRole('region', { name: 'Pendências do dia anterior' })).toHaveCount(0);

  await page.goto('/caixa?dia=ontem');
  await expect(page.getByRole('region', { name: 'Caixa não fechado' })).toContainText('Está tudo resolvido');
  await page.getByRole('region', { name: 'Caixa não fechado' }).getByRole('button', { name: 'Encerrar o dia' }).click();
  await page.getByRole('dialog', { name: /^Encerrar o dia / }).getByRole('button', { name: 'Encerrar o dia' }).click();
  await expect(page.getByRole('heading', { name: /^Dia encerrado/ })).toBeVisible();
});

test('mesa extra em 3 noites: sugere mais mesas no mapa', async ({ page }) => {
  await montarEspetaria(page);
  await page.goto('/pedidos');
  await noBancoDaDemo(page, (db, menosDias) => {
    const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza' }).format(new Date(Date.now() - 5 * 3600000));
    [[2, 1], [5, 2], [9, 1]].forEach(([dias, extras], n) => {
      for (let i = 0; i < extras; i++) {
        db.pedidos.push({
          id: `extra-${n}-${i}`,
          numero: i + 1,
          dia: menosDias(hoje, dias),
          mesa: 9 + i,
          nome_mesa: `Extra ${i + 1}`,
          status: 'entregue',
          criado_em: `${menosDias(hoje, dias)}T22:00:00-03:00`,
          pago_em: `${menosDias(hoje, dias)}T23:00:00-03:00`,
          conta_id: 'conta-antiga',
        });
      }
    });
  });
  await page.goto('/pedidos');
  const sugestao = page.getByRole('region', { name: 'Faltou mesa em 3 noites' });
  await expect(sugestao).toContainText('Quer que o mapa tenha 10 mesas em vez de 8?');
  await semProblemasDeAcessibilidade(page);

  await sugestao.getByRole('button', { name: 'Agora não' }).click();
  await expect(sugestao).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Faltou mesa em 3 noites' })).toHaveCount(0);

  // Passada uma semana, a sugestão volta.
  await noBancoDaDemo(page, (db) => {
    localStorage.removeItem(Object.keys(localStorage).find((k) => k.startsWith('organiza-sugestao-mesas-')));
    return db;
  });
  await page.reload();
  await page.getByRole('region', { name: 'Faltou mesa em 3 noites' }).getByRole('button', { name: 'Sim, quero 10 mesas' }).click();
  await expect(page.getByText('Pronto: o mapa agora tem 10 mesas.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mesas', exact: true }).getByRole('button', { name: /^Mesa \d+, livre/ })).toHaveCount(10);
});
