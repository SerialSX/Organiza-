# Organiza+

MVP para gerir produtos, lançar comandas e acompanhar pedidos na cozinha em tempo real. React, Vite, TypeScript, Tailwind CSS e Supabase.

## Configurar

1. Crie um projeto no Supabase. No **SQL Editor**, execute todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
2. Copie `.env.example` para `.env.local` e preencha a URL e a chave **publishable** (ou `anon`) do projeto. Nunca use a chave `service_role` no frontend.
3. Rode `npm install` e `npm run dev`.
4. Na tela de cadastro, informe o nome do negócio, e-mail e senha. Se a confirmação de e-mail estiver ativa no Supabase Auth, confirme o endereço antes de entrar.

## Testar o fluxo

1. Cadastre produtos com preço e custo em **Produtos**.
2. Selecione quantidades em **Comanda** e clique em **Lançar Pedido**. O banco confere a disponibilidade e calcula o total usando os preços atuais.
3. Abra **Cozinha** em outra aba com a mesma conta. Novos pedidos entram sem recarregar; marque **Preparando**, **Pronto** e **Entregue**. O botão **Esgotado** retira o produto de novas comandas. Se a conexão Realtime cair, use **Atualizar**.
4. Veja **Relatórios** após marcar pedidos como entregues. Faturamento, lucro bruto, margem bruta e produto mais vendido consideram apenas pedidos entregues. Preço e custo são guardados em cada item no momento da venda.

Cada conta cria um negócio próprio. As políticas RLS isolam os dados pelo `business_id`; pedidos e mudanças de status passam por funções SQL que validam a conta autenticada. **Remover** um produto o arquiva para preservar o histórico de vendas.

Este MVP usa uma conta por negócio. Equipes com perfis separados exigem uma futura tabela de membros e políticas adicionais.
