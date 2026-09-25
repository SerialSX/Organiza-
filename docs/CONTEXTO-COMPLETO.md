# Organiza+ — Contexto completo do projeto

Documento de referência reconstruído a partir do histórico de conversas com o Claude Code na extensão do VS Code (sessões de 19/09/2026 a 24/09/2026). Serve para retomar o trabalho no Claude Code sem reabrir a conversa antiga. As regras do dia a dia estão no `CLAUDE.md` da raiz; aqui ficam o porquê, o histórico e os detalhes técnicos. O plano de fases oficial continua sendo o `ARQUITETURA.md` do repositório.

---

## 1. Contexto acadêmico e do produto

O Organiza+ é o TCC, no formato de projeto de extensão, do curso de Análise e Desenvolvimento de Sistemas da Unifor, na disciplina Gerência de Serviços no Ciberespaço. A disciplina exige implementar a solução de verdade: o sistema precisa ser publicado, usado por pequenos empreendedores reais e gerar dados mensuráveis (número de usuários, pedidos lançados, tempo de uso etc.) até o fim do semestre, para um relatório final. Por isso o desenvolvimento acontece em fases pequenas e incrementais, priorizando ter algo funcional e testável o quanto antes.

### O problema

Pequenos empreendedores de comida de rua em Fortaleza (food trucks, trailers, barracas, lanchonetes pequenas) sofrem com a desorganização do fluxo de pedidos entre quem anota (garçom ou balcão) e quem prepara (cozinha). Hoje o processo é no papel ou verbal, o que gera erros de anotação, pedidos esquecidos, demora não percebida e falta de aviso em tempo real sobre o que acabou no estoque do dia. A equipe validou isso com pesquisa de campo e viveu o problema na prática: um pedido anotado errado quase fez um cliente sair sem pagar.

### A solução

Sistema web responsivo (não é app nativo, não haverá APK), usável em celular, tablet e computador, com dois papéis principais. Quem lança o pedido tem uma tela simples para cadastrar rapidamente o pedido selecionando produtos já cadastrados. Quem prepara recebe os pedidos em tempo real, vê qual chegou primeiro e quais estão demorando, e marca como pronto.

Funcionalidades centrais: comunicação em tempo real entre pedidos e cozinha sem recarregar a página; a cozinha marca um produto como esgotado e isso reflete na hora na tela de pedidos; cadastro de produtos e preços pelo administrador; relatórios do dia e do período (mais vendidos, margem de lucro, sugestão de reposição).

### O que o projeto não é

Não é app nativo. Não é pago: é gratuito, como projeto de extensão. Não coleta dados além do estritamente necessário para funcionar e para a pesquisa acadêmica.

### Segurança e privacidade (não negociável)

Os usuários são pequenos negócios financeiramente frágeis, então confiança é essencial para a adoção. Seguir a LGPD (coletar só o necessário, deixar claro para que serve, nunca compartilhar ou vender). Senhas nunca em texto puro. Isolamento total entre negócios. Sem rastreamento de terceiros ou analytics invasivo.

### Equipe

| Nome | Função |
|---|---|
| João Emanuel Rohsler (o usuário) | Gestão de Projeto e Arquitetura |
| Éderson Façanha | Desenvolvimento Front-end |
| Lauan Moreira | Desenvolvimento Back-end e Banco de Dados |
| João Arthur Abreu | Testes e Qualidade (QA) |
| Antonio de Macedo | Infraestrutura e DevOps |

---

## 2. Regras de trabalho

Estas regras vêm do `PROJETO_BRIEFING.md` e de correções feitas pelo usuário durante a conversa.

**Commit e push são sempre manuais.** O briefing diz, literalmente: "Quem faz commit e push é o integrante da equipe, manualmente, depois de revisar. Claude Code não deve executar git commit nem git push sozinho." Mesmo quando o usuário pede "vamos fazer o commit", a resposta é mostrar os arquivos alterados, sugerir a mensagem e entregar os comandos. Está gravado como memória do projeto (`git-commit-push-manual-only.md`).

**Sempre trabalhar em branch de feature.** Na Fase 0 o Claude trabalhou direto na `dev` local e o usuário corrigiu ("você não criou nenhuma branch para subir isso"). A partir daí, cada fase ou tarefa começa em `feature/<descricao-curta>` a partir da `dev`, e o PR vai para `dev`. Memória gravada: `git-feature-branch-workflow.md`.

**Fases pequenas, uma de cada vez.** Por causa do limite de uso por sessão, o desenvolvimento é feito em etapas sequenciais. O primeiro passo de qualquer etapa é entender o que existe e propor um plano antes de escrever código. Não implementar fases futuras nem misturar funcionalidades.

**Código limpo** e sem excesso de comentários. No último prompt, o usuário pediu comentário só onde o motivo não for óbvio.

**Copy exata.** Quando o usuário entrega textos (como a copy da landing), implementar palavra por palavra, sem criar, resumir ou parafrasear, e sem adicionar seções, números ou depoimentos que não estejam no documento. Se algo não couber, avisar em vez de encurtar.

**Não simular telas.** Nas áreas da landing que pedem prints reais do sistema, usar um placeholder visível e avisar, em vez de desenhar uma tela falsa.

**Texto sem cara de IA.** O usuário instalou o skill Humanizer (`npx skills add blader/humanizer --global`) para limpar textos com frases de efeito, listas narradas e superlativos vazios.

---

## 3. Decisões de arquitetura

### Next.js → React + Vite

O `ARQUITETURA.md` original definia Next.js + Tailwind + Supabase. Ao analisar a `origin/dev`, o Claude encontrou um projeto já em **React + Vite** (react-router-dom, CSS puro, sem Supabase e sem Tailwind), com Login, Cadastro e Home só de interface, uma paleta roxa (`#2D1B4E` → `#0F1B3C`, destaque `#7C5CFF`) e um README falando em "4 pilares" (Gestão, Saúde mental, Educação, Marketing) e backend em Java. Histórico da dev: `2c1a18c` telas de login e cadastro, `55842fc` home com hub, `671290f` README Unifor, `f8944a6` recriação em React + Vite (migração de mobile para web), `d91e5e3` README atualizado.

Decisões do usuário em 19/09: **adaptar a arquitetura para React + Vite** (manter o que já existia e atualizar o `ARQUITETURA.md`) e **escopo só do fluxo de pedidos**, descartando os 4 pilares. O `ARQUITETURA.md` do repositório foi reescrito com uma nota explicando essa troca.

### Stack atual

| Camada | Tecnologia |
|---|---|
| Front-end | React 19.2, Vite 8.3, React Router 7.18 (SPA em JSX) |
| Estilo | Tailwind CSS 4.3 via `@tailwindcss/vite`, variáveis CSS para tema |
| Estado | React Context (`ThemeContext`), `localStorage` para o tema |
| Banco, auth, tempo real | Supabase: Postgres, Auth, Realtime, Row Level Security (`@supabase/supabase-js` 2.116) |
| Lint | ESLint 10 com `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` |
| Deploy | Vercel (front, `vite build` → `dist`) e Supabase (plano free) |
| Ambiente do usuário | Windows, Node 22.15, npm 10.9 |

### Modelo de dados (`supabase/schema.sql`)

Cinco tabelas, todas com RLS ativada:

`negocios` (id uuid, nome, criado_em). `usuarios` (id = `auth.users.id`, negocio_id, nome, papel `admin` | `atendente` | `cozinha`). `produtos` (id, negocio_id, nome, preco numeric(10,2), custo numeric(10,2) opcional para margem, disponivel boolean default true, que controla o "esgotado", criado_em). `pedidos` (id, negocio_id, status `pendente` | `em_preparo` | `pronto` | `entregue`, criado_em usado para o tempo de espera, criado_por → usuarios). `itens_pedido` (id, pedido_id, produto_id, quantidade > 0, preco_unitario copiado do produto no momento do pedido).

A função `negocio_do_usuario_atual()` (`security definer`, retorna o `negocio_id` de `auth.uid()`) é usada nas policies. Situação atual das policies: `negocios` e `usuarios` só têm SELECT isolado por negócio, e cada usuário pode atualizar o próprio perfil; `produtos` e `pedidos` têm ALL isolado por `negocio_id`; `itens_pedido` é isolado via o pedido pai. **As policies de INSERT para o cadastro (criar negócio + primeiro admin) ficaram para a Fase 1.**

### Rotas

`/` Landing (pública), `/login`, `/cadastro`, `/home` (painel pós-login), `/produtos`, `/pedidos`, `/cozinha`, `/relatorios`. Desde 24/09 as rotas a partir de `/home` ficam atrás de `ProtectedRoute`, e qualquer rota desconhecida volta para `/`.

### Estrutura de pastas

```
src/
  pages/        Landing, Login (+Login.css, compartilhado com Cadastro), Cadastro, Home,
                Produtos, Pedidos, Cozinha, Relatorios
  components/   Navbar (landing), AppNav (nav fixa pós-login), ThemeToggle, ProtectedRoute,
                ScreenshotPlaceholder, icons/AppIcons.jsx,
                ui/ (AppShell, PageHeader, Aviso, Carregando, EstadoVazio)
  context/      ThemeProvider.jsx + themeContext.js + useTheme.js,
                AuthProvider.jsx + authContext.js + useAuth.js
  hooks/        useProdutos, usePedidosAbertos, useAgora
  services/     produtos, pedidos, relatorios (+ testes), demoStore
  lib/          supabaseClient, formatadores (+ testes), pedidoStatus
  assets/       logo.svg, logo-light.svg
  App.jsx  main.jsx  index.css
supabase/schema.sql
supabase/migrations/   SQL proposto, ainda não rodado
docs/backend/PENDENCIAS.md
public/icon.png
vercel.json
```

---

## 4. Identidade visual

### Evolução da paleta

A paleta roxa herdada da dev foi descartada. Na Fase 0 adotou-se a do briefing, fundo `#2D2D2D` e laranja `#E8823C`; o usuário cobrou quando o Claude não aplicou nas telas herdadas ("você não seguiu a identidade visual"). Em 22/09, com a copy nova da landing, a paleta passou a ser **fundo `#0A192F` (navy) e laranja `#EE9448`, aplicada no app inteiro** por decisão do usuário. Tokens atuais em `src/index.css`: `--color-brand-dark: #0A192F`, `--color-brand-orange: #EE9448`, `--surface: #0A192F`, `--surface-alt: #071322`. Cores por seção: produtos `#EE9448`, pedidos `#4C8DFF`, cozinha `#E85C4C`, relatórios `#3CA66E`. Tema claro: `--surface #F7F5F2`, `--surface-alt #FFFFFF`, texto `#1A1A1A`.

README e `ARQUITETURA.md` foram atualizados para a paleta nova; se algum ponto ainda citar `#2D2D2D`/`#E8823C`, está desatualizado.

### Logos

A pasta oficial é `C:\Users\Tera\Documents\Organiza+\Icones\organiza-icons` (com subpasta `extras`). O Claude primeiro usou os PNGs enviados no chat, mas o logotipo completo tinha texto preto, ilegível no fundo escuro. O usuário apontou a pasta e foram usados: `extras/logo-horizontal-dark.svg` → `src/assets/logo.svg` (texto branco + laranja), a versão de texto escuro → `src/assets/logo-light.svg`, e `extras/favicon-196.png` → `public/icon.png`. O favicon roxo antigo (`public/favicon.svg`) foi removido. Navbar e AppNav escolhem o logo conforme o tema.

### Diretriz de design

O público é de empreendedores com pouca familiaridade com tecnologia e pouca paciência para ler. O usuário exigiu um design extremamente visual: ícones grandes e claros, pouco texto, entender cada botão olhando, cor guiando o olhar, hierarquia clara entre título e texto de apoio. Foram passadas duas referências visuais (uma clara, uma escura) para entender o padrão, não para copiar. Emojis não combinam com o estilo; usar ícones SVG próprios.

---

## 5. Linha do tempo do que foi feito

**19/09 — Fase 0 (estrutura base).** Tailwind e Supabase instalados; `vite.config.js` com o plugin; tokens de marca; `supabaseClient.js` lendo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`; `.env.example` e `.env.local` no `.gitignore`; `schema.sql` com tabelas e RLS; páginas placeholder de Produtos, Pedidos, Cozinha e Relatórios; hub da Home trocado de Cardápio/Pedidos/Estoque/Financeiro para Produtos/Pedidos/Cozinha/Relatórios; `App.css` morto removido; `ARQUITETURA.md` reescrito. Build e rotas ok.

**19/09 — Correção de identidade visual.** `ThemeContext` com a paleta oficial, logos oficiais, favicon novo. O Claude validou tirando screenshots com Playwright (`npx playwright screenshot`).

**19/09 — Branch.** O usuário notou que não havia branch; foi criada `feature/fase-0-estrutura-base`.

**19/09 — README, correções e landing v1.** README reescrito com descrição, como rodar, stack e equipe. Logo aumentada (40 → 56px). O cadastro, que não dava retorno, passou a mostrar um painel "Conta criada com sucesso!" por 1,5s e redirecionar para `/login` com `state.justCreated`, onde aparece um banner de sucesso. Primeira landing (hero "Pedido sem bagunça.", bloco de dor, 4 funcionalidades, CTA, rodapé) com ícones SVG desenhados pelo Claude; o Login foi de `/` para `/login`.

**19/09 — Redesign visual.** O usuário achou o design fraco para o público e listou 12 problemas. O Claude recomendou um alternador de tema real em vez de duas telas separadas, e o usuário aceitou. Foram criados: `AppNav` (nav fixa pós-login: barra no topo no desktop, barra inferior no celular, em todas as telas internas), `ThemeToggle` (sol/lua), `AppIcons` (saco, prancheta, panela com vapor, gráfico, sol, lua), cards da Home com ícone grande, cor por seção e descrição ("Cadastre o que você vende", "Anote um novo pedido", "Veja o que precisa preparar", "Veja o que mais vendeu"), indicador estático "0 pendentes" na Cozinha, mockup do produto no hero e prova social ("Feito com base em pesquisa real com empreendedores de Fortaleza"). `Home.css` foi removido. A navbar da landing foi ajustada no mobile, escondendo "Já tenho conta".

**19/09 — Commits.** A pedido do usuário, foi criada a branch `feature/fase-0-estrutura-e-redesign`. O usuário commitou a Fase 0 (`9300fa4`) e o redesign (`c6ef7fa`). A branch `feature/fase-0-estrutura-base`, já publicada, foi apagada localmente e no GitHub, por decisão do usuário.

**22/09 — Landing final com copy nova.** O usuário enviou `Prompt_Claude_Code_LP_Final.md` com a copy exata de 8 seções: Hero ("Pare de decidir no escuro. Veja o que realmente acontece no seu negócio."), O problema, Como funciona (01 Comanda digital, 02 Cozinha em tempo real, 03 Relatório automático), O que os relatórios mostram (mais vendido × mais lucrativo, faturamento por período, aviso de reposição), Por que confiar, Redução de risco (grátis, sem instalação), CTA final ("Quero conhecer o Organiza+") e Rodapé. O botão "Ver como funciona" rola até a seção 3. Paleta navy/laranja aplicada em tudo. Como Produtos, Pedidos, Cozinha e Relatórios ainda não existem, foi criado o `ScreenshotPlaceholder` (caixa tracejada com o nome da tela e a fase), com 6 ocorrências: 3 na seção 3 e 3 na seção 4. `ProductMockup.jsx` (tela de cozinha simulada) e `FeatureIcons.jsx` (órfão) foram removidos; dá para recuperar com `git checkout c6ef7fa -- <arquivo>`. Verificado em escuro, claro e mobile de 390px, sem erro de console e sem scroll horizontal.

**23/09 — PRs e ajuste do Éderson.** Os PRs #14, #15 e #16 levaram a Fase 0, o redesign e a landing para a `dev`. O commit da landing (`fdeec22`) foi publicado **sem** a linha `Co-Authored-By`. O Éderson abriu o PR #17 (branch `Ederson`): fundo nos temas claro e escuro de Login e Cadastro (`ThemeContext.jsx`, `Login.jsx`, `Cadastro.jsx`, `Login.css`).

**24/09 — Front-end das Fases 1 a 5 (sessão autônoma, branch `feature/frontend-telas-do-fluxo`).** O usuário liberou uma sessão longa sem supervisão, com a regra de não mexer muito no back-end (não é responsabilidade dele) e só deixar organizado para quem vier depois. O que foi feito:

- **Camada de dados com modo demonstração.** `src/services/` concentra todo acesso a dados. Sem as variáveis do Supabase, tudo roda em `localStorage` (`demoStore.js`) e sincroniza entre abas, o que permite testar Pedidos e Cozinha lado a lado. Com as variáveis, o mesmo código usa Supabase + Realtime. `supabaseClient.js` deixou de quebrar sem `.env.local`.
- **Fase 1 (front).** `AuthProvider` com `signInWithPassword`, `signUp` (metadados `nome` e `nome_negocio`), sessão persistida, perfil lido de `usuarios`, erros traduzidos. `ProtectedRoute` protege as rotas internas. O cadastro trata os dois casos, com e sem confirmação de e-mail. `AppNav` ganhou botão Sair e barra no topo no celular (antes não havia tema nem logo no mobile interno).
- **Fase 2 Produtos.** CRUD com preço e custo opcional (aceita vírgula), interruptor disponível/esgotado, exclusão com confirmação (bloqueada se o produto já foi vendido).
- **Fase 3 Pedidos.** Grade de produtos com toque para adicionar, esgotados bloqueados, carrinho com +/−, total, barra fixa no celular, aviso de sucesso com código curto (`#A3F9`), lista "Pedidos em andamento" com os prontos para entregar.
- **Fase 4 Cozinha.** Pedidos do mais antigo para o mais novo, contadores (novos, preparando, atrasados), destaque de atraso a partir de 15 min, botão grande para avançar o status, seção de prontos, aba Esgotados, bipe e contador no título da aba quando chega pedido novo.
- **Fase 5 Relatórios.** Hoje, 7 dias e 30 dias. Faturamento, pedidos, ticket médio, lucro estimado, mais vendido × mais lucrativo, gráfico por dia e aviso de reposição (ranking).
- **Home** com o nome do negócio e contador real de pendentes.
- **Landing**: os 6 `ScreenshotPlaceholder` trocados por prints reais das telas novas (componente `PrintDaTela`).
- **Extras de uso real**: a Cozinha mantém a tela acesa (Wake Lock), Relatórios exporta planilha CSV (abre direto no Excel em português), manifest PWA para "Adicionar à tela inicial", `lang="pt-BR"`.
- **Qualidade.** Vitest com 18 testes (`relatorios`, `formatadores`), lint zerado (o erro antigo do `ThemeContext` foi resolvido separando `useTheme.js`/`themeContext.js` e renomeando o provider para `ThemeProvider.jsx`), `vercel.json` com rewrite de SPA.
- **Back-end só proposto.** `supabase/migrations/20260924_proposta_...sql` (trigger de cadastro, Realtime, RPC `criar_pedido`, índices) e `docs/backend/PENDENCIAS.md`. Nada foi rodado em banco.
- Verificado no navegador em desktop e 390px, claro e escuro, sem erro de console e sem scroll horizontal, com o fluxo completo produto → pedido → cozinha → relatório.

---

## 6. Estado atual e pendências

Conferir antes de agir; o estado pode ter mudado depois da última conversa.

1. **Commits da sessão de 24/09**: tudo está sem commit na branch `feature/frontend-telas-do-fluxo`. O usuário revisa e commita (sugestão de commits em partes no fim da sessão).
2. **Supabase (Lauan/Antonio)**: criar o projeto, rodar `schema.sql`, revisar e rodar a migration proposta, configurar as variáveis no `.env.local` e na Vercel e ajustar a Site URL do Auth. Passo a passo em `docs/backend/PENDENCIAS.md`.
3. **Deploy na Vercel**: ainda sem confirmação de que foi feito.
4. **Testar com Supabase real**: o caminho Supabase dos services foi escrito contra o `schema.sql`, mas só o modo demonstração foi testado de ponta a ponta.
5. **Trocar `criarPedido` pela RPC `criar_pedido`** quando ela existir no banco (marcado com `TODO(backend)`).
6. **Prints da landing**: os 6 placeholders viraram prints reais das telas (`src/assets/prints/`, via `PrintDaTela`), tirados com Playwright no modo demonstração com um cardápio de exemplo. Quando houver um negócio real usando, vale refazer com dados dele (com autorização). Sem `src`, `PrintDaTela` volta a mostrar o placeholder.
7. **Fase 6 (opcional)**: já tem manifest PWA (sem service worker, então não funciona offline) e exportação CSV. Falta: service worker/offline, PDF, polimento.
8. **Campos que o front mostraria fácil se o banco tivesse**: número sequencial do pedido por dia, cliente/mesa, observação, `pronto_em` (tempo de preparo para as métricas do TCC).

---

## 7. Comandos úteis

```bash
npm install
npm run dev        # http://localhost:5174 (ou a porta que o Vite indicar)
npm run build
npm run lint
npm test           # Vitest
```

Fluxo de uma fase (o usuário executa commit e push):

```bash
git checkout dev && git pull
git checkout -b feature/<descricao-curta>
# ... implementação ...
git add <arquivos>
git commit -m "feat: ..."
git push -u origin feature/<descricao-curta>
# abrir PR para dev no GitHub
```

Supabase: criar o projeto, copiar URL e anon key (Project Settings → API) para `.env.local` e para as Environment Variables da Vercel, e rodar `supabase/schema.sql` no SQL Editor.

---

## 8. Observações sobre o uso do Claude Code

Remoto: `https://github.com/SerialSX/Organiza-.git`. Pasta local: `C:\Users\Tera\Documents\Organiza+\Organiza-`.

A sessão original foi compactada automaticamente uma vez (em 22/09), por ter passado do limite de contexto. O usuário alterna entre Opus, Sonnet e Haiku para economizar.

O Claude validava a interface tirando screenshots com Playwright via `npx`, já que não tem como ver o navegador do usuário. Isso funcionou bem e vale repetir em mudanças visuais.

A conversa original foi convertida em `docs/historico/conversa-completa.md`, mas esse arquivo ainda não foi copiado para o repositório.
