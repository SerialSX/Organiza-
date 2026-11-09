import { test, expect } from '@playwright/test';
import { cadastrarProduto, enviar } from './ajuda';
test('TEL-01: tela não baixada falha offline sem perder navegação e fila',async({page,context})=>{
  await page.route('**/src/pages/Ajuda*',r=>r.abort());
  await page.route('**/src/pages/Caixa*',r=>r.abort());
  await cadastrarProduto(page,'Teste offline','20');
  await page.goto('/pedidos');
  await expect(page.getByRole('button',{name:/^Adicionar Teste offline,/})).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('link',{name:'Travou?',exact:true}).first().click();
  await expect(page.getByRole('heading',{name:'Sem internet para abrir esta tela'})).toBeVisible();
  await page.getByRole('link',{name:'Voltar para Pedidos'}).click();
  await page.getByRole('link',{name:'Caixa',exact:true}).first().click();
  await expect(page.getByRole('heading',{name:'Sem internet para abrir esta tela'})).toBeVisible();
  await page.getByRole('link',{name:'Voltar para Pedidos'}).click();
  await page.getByRole('button',{name:/^Adicionar Teste offline,/}).click();
  await enviar(page);
  await expect(page.getByRole('heading',{name:'1 pedido esperando a internet'})).toBeVisible();
});

test('TEL-06: senha da fila permanece até Ok enquanto monta outro pedido',async({page,context})=>{
  await cadastrarProduto(page,'Lanche da fila','20');
  await page.goto('/pedidos');
  const adicionar=page.getByRole('button',{name:/^Adicionar Lanche da fila,/});
  await adicionar.click();
  await context.setOffline(true);await enviar(page);
  await expect(page.getByRole('heading',{name:'1 pedido esperando a internet'})).toBeVisible();
  await adicionar.click();
  await context.setOffline(false);
  const aviso=page.getByRole('region',{name:'Pedidos que estavam esperando a internet'});
  await expect(aviso).toContainText('Agora é o');
  await adicionar.click();
  await expect(aviso).toContainText('001');
  await aviso.getByRole('button',{name:'Ok',exact:true}).click();
  await expect(aviso).toBeHidden();
});
