# Organiza+ — Arquitetura do Sistema e Plano de Fases

Este documento define a arquitetura técnica do projeto e o plano de desenvolvimento em fases. Leia junto com o PROJETO_BRIEFING.md antes de continuar a implementação.

> **Nota:** este documento substitui uma versão anterior que previa Next.js. A branch `dev` já tinha um projeto React + Vite em andamento (Login, Cadastro e Home funcionais), então a arquitetura foi adaptada para essa stack em vez de recomeçar do zero. O escopo também foi confirmado como o fluxo de pedidos → cozinha descrito no PROJETO_BRIEFING.md (a visão mais ampla de "4 pilares" que aparecia no README antigo não é o escopo deste TCC).

## Stack escolhida

- **Front-end:** React + Vite, com React Router para navegação entre telas, e Tailwind CSS para estilo.
  Justificativa: já era a base existente na branch `dev` (Login, Cadastro e Home já implementados), então a arquitetura foi ajustada para aproveitar esse trabalho em vez de descartá-lo. Tailwind CSS foi adicionado para agilizar responsividade e manter consistência visual.

- **Back-end, banco de dados e tempo real:** Supabase (Postgres + Realtime + Auth + Row Level Security).
  Justificativa: o projeto precisa de relatórios com agregações (produto mais vendido, margem, sugestão de reposição), e isso é natural em SQL. O Supabase já entrega, de graça: banco Postgres, autenticação pronta, canais de tempo real (essencial para a tela da cozinha atualizar sozinha) e Row Level Security, que é a peça central para isolar os dados de cada negócio uns dos outros (ponto importante para a LGPD).

- **Hospedagem:** front-end na Vercel (grátis, como SPA estática gerada pelo `vite build`), banco e back-end no Supabase (grátis, dentro do limite do plano free, suficiente para o escopo do TCC).

- **Estilo visual:** Tailwind configurado com tokens de marca (`brand-dark` = `#2D2D2D`, `brand-orange` = `#E8823C`). O `ThemeContext.jsx` (usado por Login, Cadastro e Home) foi ajustado para a mesma paleta oficial. Assets oficiais da equipe: `public/icon.png` (favicon, mark isolado), `src/assets/logo.svg` (logotipo horizontal com texto branco, para fundo escuro — usado atualmente) e `src/assets/logo-light.svg` (mesmo logotipo com texto escuro, para um eventual modo claro).

## Modelo de dados (Postgres)

```
negocios
- id (uuid, pk)
- nome (text)
- criado_em (timestamp)

usuarios  (gerenciado pelo Supabase Auth; tabela de perfil complementar)
- id (uuid, pk, = auth.users.id)
- negocio_id (uuid, fk -> negocios.id)
- nome (text)
- papel (text: "admin" | "atendente" | "cozinha")

produtos
- id (uuid, pk)
- negocio_id (uuid, fk -> negocios.id)
- nome (text)
- preco (numeric)
- custo (numeric, opcional, usado para calcular margem)
- disponivel (boolean, default true)   <- controla o "esgotado" em tempo real
- criado_em (timestamp)

pedidos
- id (uuid, pk)
- negocio_id (uuid, fk -> negocios.id)
- status (text: "pendente" | "em_preparo" | "pronto" | "entregue")
- criado_em (timestamp)     <- usado para calcular tempo de espera
- criado_por (uuid, fk -> usuarios.id)

itens_pedido
- id (uuid, pk)
- pedido_id (uuid, fk -> pedidos.id)
- produto_id (uuid, fk -> produtos.id)
- quantidade (int)
- preco_unitario (numeric)   <- copiado do produto no momento do pedido
```

Row Level Security: toda tabela filtra por `negocio_id` do usuário autenticado (via a função `negocio_do_usuario_atual()`), garantindo que um negócio nunca veja dados de outro. Script completo em `supabase/schema.sql`.

## Estrutura de pastas (React + Vite)

```
/src
  /pages
    Login.jsx
    Cadastro.jsx
    Home.jsx          (hub pós-login)
    Produtos.jsx       (CRUD de produtos, tela do admin)
    Pedidos.jsx        (tela de lançamento de pedidos, atendente/balcão)
    Cozinha.jsx        (tela em tempo real da cozinha)
    Relatorios.jsx     (dashboard de relatórios)
  /components          (componentes reutilizáveis de UI)
  /context
    ThemeContext.jsx
  /lib
    supabaseClient.js  (configuração do cliente Supabase)
  App.jsx              (rotas)
  main.jsx
  index.css            (entrada do Tailwind + tokens de marca)
/supabase
  schema.sql           (tabelas + Row Level Security)
```

## Plano de fases

### Fase 0. Estrutura base do projeto — concluída
- Projeto React + Vite com Tailwind configurado com tokens da identidade visual (`brand-dark` #2D2D2D, `brand-orange` #E8823C).
- Cliente Supabase configurado em `src/lib/supabaseClient.js`, lendo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (ver `.env.example`).
- Tabelas do banco de dados e Row Level Security básica em `supabase/schema.sql`.
- Estrutura de pastas e rotas para todas as telas futuras (com placeholders em Produtos, Pedidos, Cozinha e Relatórios).

### Fase 1. Autenticação e cadastro do negócio
- Telas de cadastro e login já existem como UI (`Cadastro.jsx`, `Login.jsx`), mas sem integração real: precisam ser conectadas ao Supabase Auth (criação de negócio + usuário admin, login real, sessão persistida).
- Policies de INSERT em `negocios`/`usuarios` para permitir o cadastro do primeiro usuário de um negócio.
- Após login, redirecionar para a área autenticada (`Home.jsx`, já existente).

### Fase 2. Cadastro de produtos
- Tela para o admin cadastrar, editar e excluir produtos (nome, preço, custo opcional) em `Produtos.jsx`.
- Botão para marcar/desmarcar um produto como disponível (esse campo será usado na Fase 4 para o "esgotou").

### Fase 3. Lançamento de pedidos
- Tela onde o atendente/balcão seleciona produtos disponíveis e quantidades, e envia o pedido, em `Pedidos.jsx`.
- O pedido é salvo com status "pendente".
- Produtos marcados como indisponíveis não podem ser selecionados.

### Fase 4. Tela da cozinha em tempo real
- Lista de pedidos em tempo real (usando Supabase Realtime) em `Cozinha.jsx`, ordenada do mais antigo para o mais novo.
- Indicação visual de pedidos "atrasados" (tempo desde a criação acima de um limite configurável, por exemplo 15 minutos).
- Botão para avançar o status do pedido (pendente → em preparo → pronto).
- Botão para marcar um produto como esgotado diretamente da tela da cozinha, atualizando a disponibilidade em tempo real na tela de pedidos.

### Fase 5. Relatórios
- Filtro por período (dia, semana, mês) em `Relatorios.jsx`.
- Produto mais vendido (quantidade).
- Faturamento total do período.
- Margem de lucro (soma de (preço - custo) × quantidade, para produtos com custo cadastrado).
- Sugestão simples de reposição: ranking dos produtos por quantidade vendida no período, para o dono decidir o que comprar mais.

### Fase 6. Ajustes finais (opcional, se sobrar tempo)
- Transformar o site em PWA instalável (ícone na tela inicial do celular, ainda sem ser um app nativo).
- Exportação simples do relatório (PDF ou CSV).
- Polimento visual e de responsividade.

## Regra geral para todas as fases

Cada fase deve ser implementada de forma independente e funcional antes de avançar para a próxima. Não pular etapas nem misturar funcionalidades de fases diferentes na mesma sessão de trabalho.
