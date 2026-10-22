# Organiza+ — Arquitetura do Sistema e Plano de Fases

Este documento define a arquitetura técnica do projeto e o plano de desenvolvimento em fases.

> **Nota:** a primeira versão deste documento previa Next.js. A branch `dev` já tinha um projeto React + Vite em andamento, então a arquitetura foi adaptada para essa stack em vez de recomeçar do zero. O escopo do TCC é o fluxo de pedidos → cozinha.

## Stack escolhida

- **Front-end:** React + Vite, React Router e Tailwind CSS. Cada tela é carregada sob demanda (`React.lazy`): quem abre a landing ou a página do QR code não baixa o painel inteiro.

- **Back-end, banco de dados e tempo real:** Supabase (Postgres + Realtime + Auth + Row Level Security). Os relatórios precisam de agregações, naturais em SQL; o Supabase entrega de graça banco, autenticação, tempo real (a cozinha atualiza sozinha) e RLS, que isola os dados de cada negócio (LGPD).

- **Hospedagem:** front-end na Vercel (SPA estática do `vite build`, `vercel.json` com rewrite) e banco no Supabase (plano free).

- **Estilo visual:** tokens de marca (`brand-dark` = `#0A192F`, `brand-orange` = `#EE9448`) e de superfície (`--surface`, `--surface-alt`, `--surface-card`, `--text-primary`, `--text-secondary`, `--border-subtle`) que trocam conforme `[data-theme]` (tema claro/escuro em `ThemeProvider.jsx`, salvo em `localStorage`). Cada seção tem uma cor de destaque (`--color-accent-produtos`, `-pedidos`, `-cozinha`, `-relatorios`).
  - Sobre fundo colorido, texto e ícone usam `--sobre-destaque` (o azul-marinho da marca, contraste acima de 5:1 em todas as cores de destaque).
  - Cor de destaque usada como texto passa por `--texto-*` (ou `corDeTexto()` em `src/lib/cores.js`): no tema claro é um tom mais escuro, para manter 4,5:1.
  - As telas passam pela auditoria axe-core (WCAG 2.1 AA) nos dois temas, no celular e no desktop.

## Modelo de dados (Postgres)

```
negocios
- id, nome, criado_em
- codigo_publico (text, único, 32 caracteres aleatórios)  <- endereço da página do QR code
- nome_publico (text, opcional)                            <- nome mostrado ao cliente
- pagina_ativa (boolean)

usuarios  (perfil complementar ao Supabase Auth)
- id (= auth.users.id), negocio_id, nome
- papel ("admin" | "atendente" | "cozinha")

produtos
- id, negocio_id, nome, preco, custo (opcional), criado_em
- disponivel (boolean)   <- "esgotado" em tempo real
- arquivado (boolean)    <- "excluir" arquiva e pode ser desfeito; os pedidos antigos continuam com o nome

pedidos
- id, negocio_id, criado_em, criado_por
- status ("pendente" | "em_preparo" | "pronto" | "entregue" | "cancelado")
- numero (senha de 1 a 999, em ordem)           <- o que o cliente ouve e digita no QR; mostrada como "007"
- dia (date, fuso de Fortaleza)                  <- separa a fila de hoje das pendências
- chave_envio (uuid, único)                      <- reenviar o mesmo pedido não duplica
- alterado_em, pronto_em, entregue_em, cancelado_em, motivo_cancelamento

itens_pedido
- id, pedido_id, produto_id, quantidade
- preco_unitario, custo_unitario   <- copiados do produto na hora do pedido
- observacao (até 140 caracteres)  <- "sem salada", mostrado na cozinha
- faltou (boolean)                 <- a cozinha avisa que não tem como fazer (produto sem ingredientes cadastrados)
- faltou_ingredientes (text[])     <- "faltou queijo": nomes guardados, o histórico não muda se renomear

ingredientes
- id, negocio_id, nome (único entre os ativos), unidade ("g" | "ml" | "un")
- preco_compra, quantidade_compra <- "R$ 45,00 por 1 kg" fica 45,00 por 1000 g; sem preço serve só para o "faltou"
- arquivado                       <- "excluir" arquiva e tira dos produtos

produto_ingredientes
- produto_id, ingrediente_id, negocio_id, quantidade  <- "120 g de carne"; chaves compostas garantem o mesmo negócio

contador_pedidos
- negocio_id, dia, ultimo         <- última senha dada no dia; só o criar_pedido mexe, travando a linha

limite_consultas   <- consultas da página pública por aparelho (hash do IP, nunca o IP)
```

### Segurança

- **Isolamento:** toda tabela tem RLS filtrando pelo negócio do usuário (`negocio_do_usuario_atual()`).
- **Sem escrita direta:** o cliente não escreve em `pedidos` nem `itens_pedido`. Tudo passa por funções que conferem negócio, status e produtos:
  - `criar_pedido`: transação única, preço lido do banco, sem duplicar;
  - `editar_pedido`: recusa a edição se outra pessoa salvou antes (versão por `alterado_em`);
  - `cancelar_pedido`, `atualizar_status_pedido` (inclui desfazer um "Pronto" em até 2 minutos), `marcar_item_faltou` e `marcar_ingrediente_faltou` (só aceita ingrediente que está no produto).
- **Custo pelos ingredientes:** `salvar_ingredientes_do_produto` troca a lista de uma vez e recalcula o custo; um gatilho em `ingredientes` recalcula todos os produtos quando o preço muda. O custo continua gravado em `produtos.custo`, então pedidos e relatórios não mudam.
- **Versão do banco:** `versao_do_banco()` precisa bater com `src/lib/versaoDoBanco.js` (um teste confere). Se o banco no ar estiver atrás do código, todas as telas da equipe mostram um aviso vermelho. Toda migração nova sobe os dois números.
- **Página pública (QR code):** quem não tem conta não lê nenhuma tabela. Só chama `pagina_publica` e `acompanhar_pedido`, que devolvem o mínimo (nome do negócio; posição, status e tempo médio de um pedido) e limitam as consultas por aparelho.
- **Conta:** `atualizar_meus_dados` (só o dono renomeia o negócio) e `excluir_minha_conta` (apaga a conta e tudo do negócio, em cascata).
- **Testes do banco:** `npm run test:banco` roda o `schema.sql` num Postgres local (PGlite) e testa essas regras, inclusive tentativas de acesso indevido.

## Estrutura de pastas

```
/src
  /pages
    Landing, Privacidade                     (públicas)
    Login, Cadastro, EsqueciSenha, RedefinirSenha
    Acompanhar                               (página do cliente via QR, sem login: /p/:codigo)
    Home, Produtos, Pedidos, Cozinha, Relatorios, PaginaDoCliente, MinhaConta
  /components
    Navbar, AppNav, TelaDeAcesso, ThemeToggle
    ProtectedRoute, ExigeConfiguracao       (login e "fora do ar" sem Supabase em produção)
    CancelarPedido, PrintDaTela, ScreenshotPlaceholder
    /ui        (AppShell, PageHeader, Botao, Campo, CampoSenha, Abas, Etiqueta, Aviso, Carregando, EstadoVazio)
    /pedidos   (GradeDeProdutos, LinhaDoPedido, PedidosDeHoje, PedidoEnviado)
    /cozinha   (CartaoFila, CartaoCancelado, BarraDesfazer, ListaEsgotados)
    /icons     (AppIcons: ícones SVG próprios)
  /context     (ThemeProvider, AuthProvider e seus hooks)
  /hooks
    useProdutos, usePedidosAbertos      (dados + tempo real, recarregam ao reconectar)
    useRascunhoDoPedido                 (pedido em montagem guardado no aparelho)
    useAbaNoEndereco, useOnline, useAgora, useTelaAcesa, useRecarregarAoVoltar
  /services    (único lugar que fala com o banco; cada função tem o caminho Supabase e o do modo demonstração)
    produtos, pedidos, paginaPublica, relatorios, demoStore
  /lib         (formatadores, pedidoStatus, fila, cores, supabaseClient)
/supabase
  schema.sql   (tabelas, RLS, funções, trigger de cadastro e Realtime)
  /testes      (testes do schema com PGlite)
/.github/workflows
  verificacao.yml   (lint, testes e build em todo PR)
  ci_v2.yml         (merge automático das PRs aprovadas)
```

### Modo demonstração

Sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, os services usam `demoStore.js`: os dados ficam no `localStorage` e as mudanças aparecem em outras abas do mesmo navegador. As regras são as mesmas das funções do banco, com testes nos dois lados (`src/services/*.test.js` e `supabase/testes`). Em produção o modo só liga com `VITE_MODO_DEMO=true`; sem isso, a falta das variáveis mostra "fora do ar".

## Plano de fases

### Fase 0. Estrutura base — concluída

### Fase 1. Autenticação e cadastro do negócio — front-end pronto, falta o Supabase no ar
- Login, cadastro (negócio + admin criados por trigger), sessão persistida, rotas protegidas.
- "Esqueci minha senha" com código de 6 dígitos enviado pelo Supabase Auth.

### Fase 2. Produtos — pronta
- Cadastrar, editar, marcar esgotado, excluir (arquivar) e devolver ao cardápio.
- Ingredientes com preço de compra; cada produto diz quanto leva de cada um e o custo sai sozinho, com o lucro por unidade na hora.

### Fase 3. Pedidos — pronta
- Toque para adicionar, observação por item, busca quando o cardápio passa de 12 itens.
- Senha de 3 dígitos para o cliente (001, 002…; volta a 001 depois de 999 e a cada dia), envio sem duplicar, rascunho guardado no aparelho.
- Editar (com aviso se outra pessoa alterou) e cancelar com motivo.

### Fase 4. Cozinha em tempo real — pronta
- Fila única do que falta fazer, do mais antigo para o mais novo; atraso a partir de 15 minutos.
- "Pronto" em um toque com "Desfazer"; "Faltou" diz qual ingrediente faltou (ou o item inteiro, se o produto não tem ingredientes) e avisa o atendente e o cliente.
- Esgotados: "Acabou um ingrediente?" esgota de uma vez os produtos que o levam.
- Aviso de pedido alterado ou cancelado (destaque, bipe e leitor de tela); tela sempre acesa; aba de esgotados.

### Fase 5. Relatórios — pronta
- Hoje, 7 e 30 dias; faturamento, pedidos, ticket médio, lucro, mais vendido × mais lucrativo, gráfico por dia (faturamento e pedidos), pedidos por hora com horário de pico, o que mais faltou na cozinha, aviso de reposição e planilha CSV.
- Cancelados ficam fora das contas e aparecem à parte, por motivo.

### Fase 6. Página do cliente via QR code — pronta
- O dono escolhe o nome mostrado, imprime o cartaz, desliga a página ou troca o endereço.
- O cliente digita a senha do pedido e acompanha posição na fila, tempo médio e o aviso de pronto, sem cadastro.

### Fase 7. Conta e LGPD — pronta
- Minha conta: nome, nome do negócio, senha, sair de todos os aparelhos e excluir conta.
- Política de privacidade (`/privacidade`).

### Próximos passos
- Supabase e Vercel no ar e teste do fluxo completo com dados reais.
- Decisões em aberto: registro de pagamento, contas de equipe por papel, adicionais pagos.

## Regra geral para todas as fases

Cada fase deve ser implementada de forma independente e funcional antes de avançar para a próxima.
