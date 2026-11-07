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
- virada_do_dia (0 a 8, padrão 5)                          <- hora em que o dia de trabalho vira (turno depois da meia-noite)
- usa_tela_cozinha (boolean)                               <- false: cozinha do lado do balcão, "Pronto" na tela de pedidos

usuarios  (perfil complementar ao Supabase Auth)
- id (= auth.users.id), negocio_id, nome
- papel ("admin" | "atendente" | "cozinha")

produtos
- id, negocio_id, nome, preco, custo (opcional), criado_em
- disponivel (boolean)   <- "esgotado" em tempo real
- arquivado (boolean)    <- "excluir" arquiva e pode ser desfeito; os pedidos antigos continuam com o nome
- vai_para_cozinha (boolean) <- false: bebida e o que sai pronto; não entra na fila da cozinha

pedidos
- id, negocio_id, criado_em, criado_por
- status ("pendente" | "em_preparo" | "pronto" | "entregue" | "cancelado")
- numero (senha de 1 a 999, em ordem)           <- o que o cliente ouve e digita no QR; mostrada como "007"
- mesa (1 a 999, opcional)                       <- consumo no salão; vazio = retirada no balcão, chamada pela senha
- dia (date, fuso de Fortaleza, com a virada)   <- separa a fila de hoje das pendências; dia_do_negocio()
- chave_envio (uuid, único)                      <- reenviar o mesmo pedido não duplica (fila sem internet)
- alterado_em, pronto_em, entregue_em, cancelado_em, motivo_cancelamento
- identificacao (até 30)                         <- "Mesa 4": chamar o cliente e somar a conta da mesa
- forma_pagamento ("pix" | "dinheiro" | "credito" | "debito"; "cartao" só na transição), pago_em <- fechamento do caixa; sem forma = a receber

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

eventos   <- só funções do banco gravam; métricas do TCC
- tipo ("marcado_esgotado" | "voltou_disponivel" | "toque_bloqueado" | "faltou_item" | "faltou_ingrediente")
- produto_id, pedido_id, detalhe, criado_em    <- "esgotado evitou venda" e faltas que continuam contadas depois de editar o pedido

limite_consultas   <- consultas da página pública por aparelho (hash do IP, nunca o IP)
```

### Segurança

- **Isolamento:** toda tabela tem RLS filtrando pelo negócio do usuário (`negocio_do_usuario_atual()`).
- **Sem escrita direta:** o cliente não escreve em `pedidos` nem `itens_pedido`. Tudo passa por funções que conferem negócio, status e produtos:
  - `criar_pedido`: transação única, preço lido do banco, sem duplicar;
  - `editar_pedido`: recusa a edição se outra pessoa salvou antes (versão por `alterado_em`);
  - `cancelar_pedido`, `atualizar_status_pedido` (inclui desfazer um "Pronto" em até 2 minutos), `marcar_item_faltou` e `marcar_ingrediente_faltou` (só aceita ingrediente que está no produto).
- **Custo pelos ingredientes:** `salvar_ingredientes_do_produto` troca a lista de uma vez e recalcula o custo; um gatilho em `ingredientes` recalcula todos os produtos quando o preço muda. O custo continua gravado em `produtos.custo`, então pedidos e relatórios não mudam.
- **Operação de campo (migração de 28/10):** `criar_pedido` aceita nome ou mesa e forma de pagamento, e pedido só de bebida já nasce pronto; `registrar_pagamento` recebe vários pedidos de uma vez (a conta da mesa); `configurar_operacao` (só o dono) muda a virada do dia e o modo sem tela de cozinha; `registrar_toque_esgotado` e o gatilho de `produtos.disponivel` gravam os eventos.
- **Correções da revisão (migração 2026-11-09):** `editar_pedido` devolve para "a receber" o pedido pago cujo valor mudou e tira da fila da cozinha o que ficou só com bebida; `marcar_item_faltou` e `marcar_ingrediente_faltou` contam a mesma falta uma vez só; o tempo médio da página do cliente ignora os pedidos que nasceram prontos; `configurar_operacao` recusa trocar a virada quando isso mudaria o dia de trabalho em andamento (entre 0h e 8h). No aparelho, os pedidos guardados sem internet são reenviados em qualquer tela (o hook fica no `AppShell`) e os de outro dia param esperando o atendente descartar.
- **Boas-vindas e pagamento (migração 2026-11-10):** `negocios.modo_atendimento` (`balcao`, `mesa`, `balcao_e_mesa`; vazio = o dono ainda não respondeu) e `configurar_atendimento` (só o dono) salvam as perguntas de boas-vindas. A forma de pagamento passa a ser Pix, dinheiro, crédito ou débito; `cartao` continua aceito durante a transição (aparelho com o site anterior aberto ou pedido guardado sem internet) e sai numa migração futura.
- **Versão do banco:** `versao_do_banco()` precisa bater com `src/lib/versaoDoBanco.js` (um teste confere). Se o banco no ar estiver atrás do código, todas as telas da equipe mostram um aviso vermelho. Toda migração nova sobe os dois números.
- **Página pública (QR code):** quem não tem conta não lê nenhuma tabela. Só chama `pagina_publica` e `acompanhar_pedido`, que devolvem o mínimo (nome do negócio; posição, status e tempo médio de um pedido) e limitam as consultas por aparelho.
- **Leitura do cardápio por IA:** o navegador nunca fala com o Google. A Edge Function `ler-cardapio` guarda a chave do Gemini nos Secrets, confere o login (`getClaims`), aceita só JPEG de até 4 MB e chama `registrar_leitura_cardapio()` antes da IA (20 leituras por negócio por dia). A resposta é validada no servidor (até 100 itens, nome de 1 a 120 caracteres, preço até 9.999,99) e a pessoa confere antes de virar produto. A foto não é guardada; `leituras_cardapio` só tem o negócio e a hora.
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
    Navbar, AppNav, TelaDeAcesso, ThemeToggle, RodapeContato
    ProtectedRoute, ExigeConfiguracao       (login e "fora do ar" sem Supabase em produção)
    CancelarPedido, PrintDaTela, ScreenshotPlaceholder
    /ui        (AppShell, PageHeader, Botao, Campo, CampoSenha, Abas, Etiqueta, Aviso, Carregando, EstadoVazio)
    /pedidos   (GradeDeProdutos, LinhaDoPedido, DestinoDoPedido, PedidosDeHoje, PedidoEnviado)
    /cozinha   (CartaoFila, CartaoCancelado, BarraDesfazer, ListaEsgotados, MolduraMonitor)
    /icons     (AppIcons: ícones SVG próprios)
  /context     (ThemeProvider, AuthProvider e seus hooks)
  /hooks
    useProdutos, usePedidosAbertos      (dados + tempo real, recarregam ao reconectar)
    useRascunhoDoPedido                 (pedido em montagem guardado no aparelho)
    useAbaNoEndereco, useOnline, useAgora, useTelaAcesa, useRecarregarAoVoltar
    useAlertaSonoro                     (libera o som da Cozinha no primeiro toque e avisa enquanto o navegador bloquear)
  /services    (único lugar que fala com o banco; cada função tem o caminho Supabase e o do modo demonstração)
    produtos, pedidos, paginaPublica, relatorios, demoStore
  /lib         (formatadores, pedidoStatus, fila, cores, alertaSonoro, contato, supabaseClient)
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
- Mesa ou balcão: o pedido pode ir para uma mesa (número de 1 a 999, consumo no salão) ou ser retirado no balcão, chamado pela senha. A mesa aparece no aviso de enviado, na lista do atendente e na Cozinha, e pode ser trocada na edição.
- Editar (com aviso se outra pessoa alterou) e cancelar com motivo.
- Nome ou mesa no pedido; a conta de cada mesa soma a noite toda e fecha de uma vez. Forma de pagamento na hora ou depois.
- Sem internet: o pedido fica guardado no aparelho e sai sozinho quando a conexão volta, sem duplicar.
- Toque em produto esgotado registrado (venda que teria saído errada).
- Modo sem tela de cozinha: o "Pronto" fica na tela de pedidos.

### Fase 4. Cozinha em tempo real — pronta
- Fila única do que falta fazer, do mais antigo para o mais novo; atraso a partir de 15 minutos.
- "Pronto" em um toque com "Desfazer"; "Faltou" diz qual ingrediente faltou (ou o item inteiro, se o produto não tem ingredientes) e avisa o atendente e o cliente.
- Esgotados: "Acabou um ingrediente?" esgota de uma vez os produtos que o levam.
- Aviso de pedido alterado ou cancelado (destaque, bipe e leitor de tela); tela sempre acesa; aba de esgotados.
- Som sempre ligado: pedido novo toca três notas (mais forte que o bipe de alterado/cancelado) e o "Pronto" toca um som curto de confirmação. Abrindo a Cozinha direto, o navegador só libera o som depois do primeiro toque, e a tela avisa ("Toque para ligar o som"). Vibração junto com o som, aviso de "Reconectando" com conferência a cada 8 s e cabeçalho compacto no tablet deitado.
- Modo monitor (`/cozinha?modo=monitor`): a fila numa TV ou tablet da cozinha, sem o menu do sistema, com alto contraste fixo (fundo preto) nos dois temas, posição de cada pedido na fila (1º, 2º…), mesa em destaque e tela cheia.
- Bebida (produto que não vai para a cozinha) aparece só como lembrete no cartão.

### Fase 5. Relatórios — pronta
- Hoje, 7 e 30 dias; faturamento, pedidos, ticket médio, lucro, mais vendido × mais lucrativo, gráfico por dia (faturamento e pedidos), pedidos por hora com horário de pico, o que mais faltou na cozinha, aviso de reposição e planilha CSV.
- Cancelados ficam fora das contas e aparecem à parte, por motivo.
- Tempo até ficar pronto (mediana e quantos passaram de 15 min). O "dia" respeita a virada do negócio.
- Caixa (`/caixa`): recebido por Pix, dinheiro e cartão, o que falta receber e o cancelado depois de pago.

### Fase 6. Página do cliente via QR code — pronta
- O dono escolhe o nome mostrado, imprime o cartaz, desliga a página ou troca o endereço.
- O cliente digita a senha do pedido e acompanha posição na fila, tempo médio e o aviso de pronto, sem cadastro.

### Fase 7. Conta e LGPD — pronta
- Minha conta: nome, nome do negócio, senha (pede a atual), "Como você atende" (balcão, mesa ou os dois; aparelho na cozinha; virada do dia), sair de todos os aparelhos e excluir conta (pede a senha). "Sair" desconecta só o aparelho.
- Política de privacidade (`/privacidade`) e Ajuda (`/ajuda`) com as dúvidas da validação de campo.
- Contato da equipe para ajuda (joaoemanuel15@edu.unifor.br, em `src/lib/contato.js`): no rodapé da landing, das telas de acesso e do painel, na Ajuda e na política de privacidade.
- Tela que se recupera sozinha depois de um deploy (ErroDaTela e recarga) e workflow de saúde a cada 6 h.

### Próximos passos
- Supabase e Vercel no ar e teste do fluxo completo com dados reais.
- Decisões em aberto: contas de equipe por papel, adicionais pagos, app instalável (PWA) para abrir telas sem internet.

## Regra geral para todas as fases

Cada fase deve ser implementada de forma independente e funcional antes de avançar para a próxima.
