# Roteiro de teste manual

Para conferir o fluxo inteiro antes de cada entrega. Dá para rodar no modo demonstração (sem `.env.local`) ou com o Supabase configurado. Testar no celular (ou com a janela estreita) e no computador, nos temas claro e escuro.

Para zerar os dados do modo demonstração: no console do navegador, `localStorage.removeItem('organiza-demo-db')` e recarregar.

## 1. Conta (só com Supabase)

- [ ] Cadastro com um campo vazio mostra "Preencha todos os campos."
- [ ] Senha com menos de 6 caracteres e senhas diferentes mostram o erro certo.
- [ ] Cadastro válido entra no painel com o nome do negócio no título (ou mostra "Falta só confirmar", se a confirmação de e-mail estiver ligada).
- [ ] Login com senha errada mostra "E-mail ou senha incorretos."
- [ ] Abrir `/cozinha` sem estar logado leva ao login e, depois de entrar, volta para `/cozinha`.
- [ ] Botão Sair (ícone de porta) desloga.
- [ ] Duas contas diferentes não veem os produtos e pedidos uma da outra.

## 2. Produtos

- [ ] Sem produtos, aparece "Nenhum produto ainda" com botão para cadastrar.
- [ ] Salvar sem nome ou com preço zero mostra erro.
- [ ] Preço aceita `12,50`, `12.50` e `1.500` (mil e quinhentos).
- [ ] Com custo, o cartão mostra o lucro por unidade.
- [ ] Editar muda nome e preço.
- [ ] Interruptor marca como esgotado e o cartão mostra a etiqueta vermelha.
- [ ] Excluir pede confirmação. Produto que já apareceu em pedido não é excluído e o aviso sugere marcar como esgotado.

## 3. Pedidos

- [ ] Tocar num produto soma 1 e mostra a quantidade no cartão.
- [ ] Produto esgotado aparece apagado e não pode ser tocado.
- [ ] − e + ajustam a quantidade, e o total bate.
- [ ] No celular, a barra com o total e o botão Enviar aparece acima do menu.
- [ ] Enviar mostra "Pedido #XXXX enviado para a cozinha." e limpa o pedido.
- [ ] Pedido marcado como pronto na cozinha aparece em "Pedidos em andamento" com o botão Entregue.

## 4. Cozinha (abrir em outra aba ou aparelho, ao lado de Pedidos)

- [ ] Pedido enviado aparece sozinho, sem recarregar, e o título da aba mostra `(1)`.
- [ ] Ordem: o mais antigo primeiro.
- [ ] Contadores de novos, preparando e atrasados batem com os cartões.
- [ ] Depois de 15 minutos o cartão fica vermelho com "Atrasado".
- [ ] Os botões avançam: Começar preparo → Marcar como pronto → Entregue (some da lista).
- [ ] Na aba Esgotados, tocar num produto bloqueia ele na tela de Pedidos na hora.
- [ ] A tela não apaga sozinha enquanto a Cozinha está aberta (celular ou tablet).

## 5. Relatórios

- [ ] Sem vendas no período aparece "Nenhuma venda no período".
- [ ] Faturamento, pedidos e ticket médio batem com a soma dos pedidos do dia.
- [ ] Lucro estimado ignora produtos sem custo e avisa quantos ficaram de fora.
- [ ] Em 7 e 30 dias aparece o gráfico por dia.
- [ ] "Baixar planilha" gera um CSV que abre no Excel com acentos e vírgula decimal.

## 6. Geral

- [ ] Sem rolagem horizontal em 390px de largura.
- [ ] Alternar tema claro/escuro funciona em todas as telas e fica salvo ao recarregar.
- [ ] Navegando só pelo teclado (Tab), o item em foco fica com contorno laranja.
- [ ] Nenhum erro no console do navegador.
