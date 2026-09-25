# Organiza+ — Arquitetura do Sistema e Plano de Fases

Este documento define a arquitetura técnica do projeto e o plano de desenvolvimento em fases. Leia junto com o PROJETO_BRIEFING.md antes de continuar a implementação.

> **Nota:** este documento substitui uma versão anterior que previa Next.js. A branch `dev` já tinha um projeto React + Vite em andamento (Login, Cadastro e Home funcionais), então a arquitetura foi adaptada para essa stack em vez de recomeçar do zero. O escopo também foi confirmado como o fluxo de pedidos → cozinha descrito no PROJETO_BRIEFING.md (a visão mais ampla de "4 pilares" que aparecia no README antigo não é o escopo deste TCC).

## Stack escolhida

- **Front-end:** React + Vite, com React Router para navegação entre telas, e Tailwind CSS para estilo.
  Justificativa: já era a base existente na branch `dev` (Login, Cadastro e Home já implementados), então a arquitetura foi ajustada para aproveitar esse trabalho em vez de descartá-lo. Tailwind CSS foi adicionado para agilizar responsividade e manter consistência visual.

- **Back-end, banco de dados e tempo real:** Supabase (Postgres + Realtime + Auth + Row Level Security).
  Justificativa: o projeto precisa de relatórios com agregações (produto mais vendido, margem, sugestão de reposição), e isso é natural em SQL. O Supabase já entrega, de graça: banco Postgres, autenticação pronta, canais de tempo real (essencial para a tela da cozinha atualizar sozinha) e Row Level Security, que é a peça central para isolar os dados de cada negócio uns dos outros (ponto importante para a LGPD).

- **Hospedagem:** front-end na Vercel (grátis, como SPA estática gerada pelo `vite build`), banco e back-end no Supabase (grátis, dentro do limite do plano free, suficiente para o escopo do TCC).

- **Estilo visual:** Tailwind configurado com tokens de marca (`brand-dark` = `#0A192F`, `brand-orange` = `#EE9448`) e tokens de superfície (`--surface`, `--surface-alt`, `--surface-card`, `--text-primary`, `--text-secondary`, `--border-subtle`) que trocam de valor conforme `[data-theme]`, permitindo um alternador claro/escuro real (botão de sol/lua no `Navbar` e no `AppNav`, estado em `ThemeProvider.jsx`, persistido em `localStorage`). Cada seção autenticada tem uma cor de destaque própria (`--color-accent-produtos`, `-pedidos`, `-cozinha`, `-relatorios`) para diferenciação visual rápida. Assets oficiais da equipe: `public/icon.png` (favicon, mark isolado), `src/assets/logo.svg` (logotipo horizontal com texto branco, para fundo escuro) e `src/assets/logo-light.svg` (mesmo logotipo com texto escuro, para fundo claro) — o componente escolhe qual usar de acordo com o tema ativo.

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
    Landing.jsx        (landing page pública, rota "/")
    Login.jsx           (rota "/login")
    Cadastro.jsx        (rota "/cadastro", cria negócio + admin)
    Home.jsx           (painel pós-login, rota "/home")
    Produtos.jsx        (CRUD de produtos + disponível/esgotado)
    Pedidos.jsx         (lançamento de pedidos, atendente/balcão)
    Cozinha.jsx         (fila em tempo real da cozinha + esgotados)
    Relatorios.jsx      (dashboard de relatórios)
  /components
    Navbar.jsx          (barra do topo da landing, pública)
    AppNav.jsx          (navegação fixa pós-login: topo no desktop, topo + barra inferior no mobile)
    ProtectedRoute.jsx  (bloqueia rotas internas sem login)
    ThemeToggle.jsx      (botão de alternar claro/escuro)
    PrintDaTela.jsx      (print real de uma tela na landing; sem imagem, usa o placeholder)
    ScreenshotPlaceholder.jsx  (espaço reservado para print)
    /ui                 (AppShell, PageHeader, Aviso, Carregando, EstadoVazio)
    /icons
      AppIcons.jsx       (ícones SVG próprios)
  /context
    ThemeProvider.jsx, themeContext.js, useTheme.js  (tema claro/escuro, persistido em localStorage)
    AuthProvider.jsx, authContext.js, useAuth.js     (sessão Supabase Auth + perfil do usuário)
  /hooks
    useProdutos.js, usePedidosAbertos.js  (carregam dados e assinam o tempo real)
    useAgora.js                           (relógio para tempo de espera)
  /services             (único lugar que fala com o banco)
    produtos.js, pedidos.js
    relatorios.js       (cálculos do relatório, com testes)
    demoStore.js        (banco local do modo demonstração)
  /lib
    supabaseClient.js   (cliente Supabase; null sem variáveis de ambiente)
    formatadores.js     (moeda, tempo de espera, código do pedido, com testes)
    pedidoStatus.js     (status do pedido, cores e limite de atraso)
  App.jsx               (rotas)
  main.jsx
  index.css             (entrada do Tailwind + tokens de marca e de tema)
/supabase
  schema.sql            (tabelas + Row Level Security)
  /migrations           (mudanças propostas, revisar antes de rodar)
/docs
  CONTEXTO-COMPLETO.md  (histórico e decisões)
  /backend/PENDENCIAS.md
vercel.json             (rewrite de SPA)
```

### Modo demonstração

Sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, `isSupabaseConfigured` é falso e os services usam `demoStore.js`: os dados ficam no `localStorage` e as mudanças aparecem em outras abas do mesmo navegador (dá para abrir Pedidos e Cozinha lado a lado). Não há login real nesse modo e nenhuma senha é guardada. Uma faixa laranja nas telas internas avisa que é demonstração. Com as variáveis definidas, o mesmo código usa Supabase e Realtime.

## Plano de fases

### Fase 0. Estrutura base do projeto — concluída
- Projeto React + Vite com Tailwind configurado com tokens da identidade visual (`brand-dark` #0A192F, `brand-orange` #EE9448).
- Cliente Supabase configurado em `src/lib/supabaseClient.js`, lendo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (ver `.env.example`).
- Tabelas do banco de dados e Row Level Security básica em `supabase/schema.sql`.
- Estrutura de pastas e rotas para todas as telas futuras (com placeholders em Produtos, Pedidos, Cozinha e Relatórios).

### Fase 1. Autenticação e cadastro do negócio — front-end pronto, falta o back-end
- `Login.jsx` e `Cadastro.jsx` conectados ao Supabase Auth via `AuthProvider` (login real, cadastro com negócio + admin, sessão persistida, erros em português, com e sem confirmação de e-mail).
- Criação do negócio + perfil admin no cadastro: proposta via trigger em `auth.users` (em vez de policies de INSERT abertas ao cliente), em `supabase/migrations/`.
- Após login, redirecionar para a área autenticada; rotas internas protegidas por `ProtectedRoute`.

### Fase 2. Cadastro de produtos — front-end pronto
- Tela para o admin cadastrar, editar e excluir produtos (nome, preço, custo opcional) em `Produtos.jsx`.
- Botão para marcar/desmarcar um produto como disponível (esse campo será usado na Fase 4 para o "esgotou").

### Fase 3. Lançamento de pedidos — front-end pronto
- Tela onde o atendente/balcão seleciona produtos disponíveis e quantidades, e envia o pedido, em `Pedidos.jsx`.
- O pedido é salvo com status "pendente".
- Produtos marcados como indisponíveis não podem ser selecionados.

### Fase 4. Tela da cozinha em tempo real — front-end pronto (Realtime depende da migration)
- Lista de pedidos em tempo real (usando Supabase Realtime) em `Cozinha.jsx`, ordenada do mais antigo para o mais novo.
- Indicação visual de pedidos "atrasados" (tempo desde a criação acima de um limite configurável, por exemplo 15 minutos).
- Botão para avançar o status do pedido (pendente → em preparo → pronto).
- Botão para marcar um produto como esgotado diretamente da tela da cozinha, atualizando a disponibilidade em tempo real na tela de pedidos.

### Fase 5. Relatórios — front-end pronto
- Filtro por período (dia, semana, mês) em `Relatorios.jsx`.
- Produto mais vendido (quantidade).
- Faturamento total do período.
- Margem de lucro (soma de (preço - custo) × quantidade, para produtos com custo cadastrado).
- Sugestão simples de reposição: ranking dos produtos por quantidade vendida no período, para o dono decidir o que comprar mais.

### Fase 6. Ajustes finais (opcional, se sobrar tempo) — em andamento (manifest PWA e CSV prontos)
- Transformar o site em PWA instalável (ícone na tela inicial do celular, ainda sem ser um app nativo).
- Exportação simples do relatório (PDF ou CSV).
- Polimento visual e de responsividade.

## Regra geral para todas as fases

Cada fase deve ser implementada de forma independente e funcional antes de avançar para a próxima. Não pular etapas nem misturar funcionalidades de fases diferentes na mesma sessão de trabalho.
