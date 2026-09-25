# Organiza+ — instruções para o Claude Code

Sistema web responsivo (TCC/projeto de extensão, ADS Unifor) que organiza o fluxo de pedidos entre quem anota (garçom/balcão) e a cozinha, para pequenos negócios de comida de rua de Fortaleza. Repositório: `SerialSX/Organiza-`. Contexto detalhado, decisões e histórico em `docs/CONTEXTO-COMPLETO.md` (consultar só quando precisar). Plano de fases oficial em `ARQUITETURA.md`. Pendências do back-end em `docs/backend/PENDENCIAS.md`. Roteiro de teste manual em `docs/ROTEIRO-DE-TESTE.md`.

## Regras de Git

- **Nunca rodar `git commit` nem `git push`**, mesmo quando o usuário disser "faça o commit". Mostrar os arquivos alterados, sugerir a mensagem e entregar os comandos para ele rodar.
- Todo trabalho novo em branch `feature/<descricao-curta>` a partir da `dev`, nunca direto na `dev` ou na `main`. Se já começou na `dev` por engano, criar a branch antes de entregar (`git checkout -b` carrega as mudanças).
- PR da feature para `dev`.
- Não incluir linha `Co-Authored-By: Claude` nas mensagens de commit sugeridas sem perguntar.

## Escopo e prioridades

- Escopo do TCC: **somente o fluxo pedido → cozinha** (produtos, pedidos, cozinha em tempo real, relatórios). A antiga visão de "4 pilares" (gestão, saúde, educação, marketing) está fora.
- Web responsivo, sem app nativo e sem APK. Gratuito.
- Prazo curto: o sistema precisa ir ao ar com usuários reais e gerar dados de uso para o relatório final. Construir em fases pequenas e testáveis.
- Estado (24/09): o **front-end das Fases 1 a 5 está pronto** e roda em modo demonstração. Falta o back-end real (Supabase criado, `schema.sql` + migration proposta rodados, variáveis na Vercel). Ver `docs/backend/PENDENCIAS.md`.
- Implementar apenas o que foi pedido. Quando o usuário passar uma copy, usar o texto exato, sem resumir nem "melhorar"; se não couber, avisar.
- O usuário é responsável por front-end e arquitetura; back-end (Lauan) e DevOps (Antonio) são de outros integrantes. No back-end, propor e documentar em vez de mudar direto.

## Segurança e privacidade (inegociável)

LGPD: coletar só o necessário e não compartilhar dados. Senhas sempre com hash (Supabase Auth). Cada negócio vê só os próprios dados via Row Level Security (`negocio_do_usuario_atual()`). Sem rastreamento de terceiros ou analytics invasivo. O modo demonstração nunca guarda senha.

## Stack

React 19 + Vite 8 + React Router 7 (SPA, JavaScript/JSX), Tailwind CSS 4 (`@tailwindcss/vite`), Supabase (Postgres, Auth, Realtime, RLS) com `@supabase/supabase-js`, Vitest para testes. Deploy: Vercel (`vite build` → `dist`, `vercel.json` com rewrite de SPA) + Supabase. **Não é Next.js**: a arquitetura original previa Next.js, mas foi adaptada para a base React+Vite que já existia.

## Arquitetura do front

- **Dados só via `src/services/`** (`produtos.js`, `pedidos.js`, `relatorios.js`). Cada função tem dois caminhos: Supabase, quando `isSupabaseConfigured` (em `src/lib/supabaseClient.js`) é verdadeiro, e `demoStore.js` (localStorage, sincroniza entre abas) quando não é. Telas não importam o Supabase.
- **Auth** em `src/context/AuthProvider.jsx`, com o hook `useAuth()` em `src/context/useAuth.js`. Rotas internas ficam atrás de `ProtectedRoute`. O perfil (`usuarios` + nome do negócio) dá o `negocio_id` usado nos inserts.
- **Hooks de dados**: `useProdutos`, `usePedidosAbertos` (os dois assinam o tempo real) e `useAgora` (relógio da cozinha).
- **UI compartilhada** em `src/components/ui/` (`AppShell`, `PageHeader`, `Aviso`, `Carregando`, `EstadoVazio`).
- Contexto e hook ficam em arquivos separados (`themeContext.js` + `useTheme.js` + `ThemeProvider.jsx`) por causa da regra `react-refresh/only-export-components`.

## Visual

- Paleta atual (desde 22/09): fundo `#0A192F` (navy), laranja `#EE9448`. A antiga `#2D2D2D` / `#E8823C` não vale mais.
- Público com pouca familiaridade com tecnologia: ícones grandes, pouco texto, cor guiando o olhar, hierarquia clara. Sem emojis na interface; ícones em SVG próprios (`src/components/icons/AppIcons.jsx`).
- Tema claro/escuro real via variáveis em `src/index.css` (`--surface`, `--surface-alt`, `--surface-card`, `--text-primary`, `--text-secondary`, `--border-subtle`) e `[data-theme]`, controlado pelo `ThemeProvider` (salvo em `localStorage`, chave `organiza-theme`). Usar essas variáveis em vez de cores fixas.
- Cores por seção: `--color-accent-produtos`, `-pedidos`, `-cozinha`, `-relatorios`. Status do pedido em `src/lib/pedidoStatus.js`.
- Logos: `src/assets/logo.svg` (texto claro, fundo escuro), `src/assets/logo-light.svg` (texto escuro, fundo claro), `public/icon.png` (favicon). Originais em `C:\Users\Tera\Documents\Organiza+\Icones\organiza-icons`. Não recriar o símbolo.
- Não simular telas do produto na landing: só prints reais (`src/assets/prints/`, via `PrintDaTela`); sem print, `PrintDaTela` mostra o `ScreenshotPlaceholder`.

## Código

- Código limpo, comentário só onde o motivo não for óbvio. Nomes em português, como no resto do projeto.
- Validar com `npm run build`, `npm run lint` (sem erros desde 24/09) e `npm test`.
- Dev server: `npm run dev` (normalmente em `http://localhost:5174`). Sem `.env.local` ele abre em modo demonstração.
- Variáveis: `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (modelo em `.env.example`). Schema em `supabase/schema.sql`; mudanças propostas em `supabase/migrations/`.
