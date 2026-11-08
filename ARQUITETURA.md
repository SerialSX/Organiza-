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
- virada_do_dia (5 para todos; o dono não muda)            <- hora em que o dia de trabalho vira (turno depois da meia-noite)
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
- forma_pagamento ("pix" | "dinheiro" | "credito" | "debito"; "cartao" só nos pedidos antigos), pago_em <- fechamento do caixa; sem forma = a receber
- nao_recebido_em                                <- foram embora sem pagar: fora do vendido e do a receber, contado à parte
- devolucao ("a_devolver" | "devolvido"), devolvido_em <- pedido pago e depois cancelado: o dinheiro já voltou ao cliente?

dias_encerrados
- negocio_id, dia, encerrado_em, encerrado_por   <- "Encerrar o dia"; apagado sozinho (gatilho) quando um pedido do dia volta a ficar em aberto

itens_pedido
- id, pedido_id, produto_id, quantidade
- preco_unitario, custo_unitario   <- copiados do produto na hora do pedido
- observacao (até 140 caracteres)  <- "sem salada", mostrado na cozinha
- faltou (boolean)                 <- a cozinha avisa que não tem como fazer (produto sem ingredientes cadastrados)
- faltou_ingredientes (text[])     <- "faltou queijo": nomes guardados, o histórico não muda se renomear
- tamanho_id, tamanho (até 20)     <- o tamanho escolhido e o nome copiado ("G"); produto com tamanhos não entra sem ele

ingredientes
- id, negocio_id, nome (único entre os ativos), unidade ("g" | "ml" | "un")
- preco_compra, quantidade_compra <- "R$ 45,00 por 1 kg" fica 45,00 por 1000 g; sem preço serve só para o "faltou"
- arquivado                       <- "excluir" arquiva e tira dos produtos

produto_ingredientes
- produto_id, ingrediente_id, negocio_id, quantidade  <- "120 g de carne"; chaves compostas garantem o mesmo negócio
                                                       (produto com tamanhos: a maior quantidade; vale para o "faltou")

produto_tamanhos   <- pizza P, M, G; açaí 300 ml e 500 ml (2 a 8 por produto)
- id, produto_id, negocio_id, nome (1 a 20, único entre os ativos do produto), preco, custo
- disponivel (esgotado só deste tamanho; o esgotado do produto vale para todos)
- arquivado (tirar um tamanho arquiva: os pedidos antigos continuam com o nome), ordem
- o produto continua com preco/custo iguais aos do primeiro tamanho (sincronizar_produto_com_tamanhos)

tamanho_ingredientes
- tamanho_id, ingrediente_id, negocio_id, quantidade  <- quanto vai em cada tamanho; o custo de cada tamanho sai sozinho

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
- **Mesas e conta (migração 2026-11-11):** `negocios.quantidade_mesas` (1 a 200) e `negocios.taxa_servico` (0 a 30%; vazio = o dono ainda não respondeu), salvos por `configurar_mesas` (só o dono). `pedidos.nome_mesa` guarda o nome da mesa extra ("Varanda"); `passar_mesa` muda os pedidos abertos de mesa (ou junta duas contas). `fechar_conta_mesa` calcula no banco o consumo e o serviço, confere que as partes somam o total e grava `contas_mesa` (jeito: `um_pagou`, `dividiram`, `separado`) e `pagamentos_conta` (forma e valor de cada parte); o pedido fica com `conta_id` e `pago_em`, sem forma. Pedido pago numa conta não muda de valor nem é cancelado: antes, `desfazer_conta_mesa` (no Caixa) apaga a conta e reabre a mesa. O Caixa soma as partes por forma, mostra "Pago separado, sem detalhe" e a taxa de serviço à parte (fora do vendido; os relatórios contam só os itens). Banco sem a migração: o front pede só as colunas antigas e volta ao número da mesa digitado.
- **Fim do dia (migração 2026-11-12):** a virada fica às 5h para todos (`configurar_operacao` saiu) e nada é cancelado sozinho. `encerrar_dia` só encerra o dia sem pedido em aberto (sem entregar, ou entregue sem receber); a lista do que resolver usa `marcar_entregues`, `marcar_nao_recebido` (e `desfazer_nao_recebido` no Caixa), `cancelar_conta` e o fechamento normal da conta. `cancelar_pedido` pergunta se o dinheiro de um pedido pago foi devolvido (`p_devolucao`; sem resposta fica "a devolver") e `marcar_devolvido` tira do "A devolver". O que ficou aberto de dias anteriores aparece como "Pendências do dia anterior" no Início. `criar_pedido` e `registrar_pagamento` recusam "cartao" (só crédito ou débito). `excluir_minha_conta(p_senha)` confere a senha no banco (`extensions.crypt`), com 5 tentativas a cada 15 minutos (`tentativas_senha`). Mesa extra em 3 noites dos últimos 14 dias: o mapa sugere ao dono aumentar o número de mesas. Banco sem a migração: o front pede só as colunas antigas, cancela sem a devolução e confere a senha no aparelho antes de excluir.
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
- Importar planilha (`src/components/produtos/ImportarPlanilha.jsx`): modelo .xlsx para baixar, montado no navegador (`src/lib/modeloDePlanilha.js`, abas "Cardápio" e "Como preencher"); lê .xlsx e .csv no próprio aparelho, sem biblioteca (`src/lib/lerPlanilha.js`: ZIP com DecompressionStream e XML), e explica o que fazer com .xls, PDF ou arquivo vazio. Acha as colunas pelo título (ou nome e preço sem título), junta linhas repetidas iguais, pede escolha quando o nome se repete com valores diferentes ou já está no cardápio ("Manter como está" é o padrão) e desmarca "Vai para a cozinha" do que parece bebida (`src/lib/importarPlanilha.js`). Os novos entram de uma vez (tudo ou nada) e tentar de novo não duplica. Até 300 produtos por planilha.
- Tamanhos (`src/lib/tamanhos.js`, `src/lib/formularioProduto.js`, `src/components/produtos/TamanhosDoProduto.jsx`): "Tem tamanhos?" no cadastro, com "P · M · G" e "Pequeno · Médio · Grande" para preencher, de 2 a 8 tamanhos, cada um com preço, custo (pelos ingredientes, quanto vai em cada tamanho, ou digitado) e esgotado próprio. Em Pedidos, um botão por tamanho com o preço, sempre à vista; a conta, o caixa e os resumos mostram "Pizza Calabresa (G)"; a Cozinha mostra o tamanho num selo grande antes do nome; trocar o tamanho na edição é um item novo, com o preço do tamanho novo, e marca o pedido como alterado. Relatório: "Pizza Calabresa: 30 (P 5 · M 10 · G 15)", com o lucro pelo custo de cada tamanho. Planilha com a coluna "Tamanho" (mesmo nome em várias linhas = um produto com tamanhos; um tamanho só vira preço único com o tamanho no nome). Cardápio pronto "Pizzaria". Desligar os tamanhos pede um preço único; tirar um tamanho não muda os pedidos feitos. Banco sem a migração 2026-11-13: as telas escondem os tamanhos e seguem como antes (`aceitaTamanhos()` em `src/services/produtos.js`).

### Fase 3. Pedidos — pronta
- Toque para adicionar, observação por item, busca quando o cardápio passa de 12 itens.
- Senha de 3 dígitos para o cliente (001, 002…; volta a 001 depois de 999 e a cada dia), envio sem duplicar, rascunho guardado no aparelho.
- Mesa ou balcão: o pedido pode ir para uma mesa (número de 1 a 999, consumo no salão) ou ser retirado no balcão, chamado pela senha. A mesa aparece no aviso de enviado, na lista do atendente e na Cozinha, e pode ser trocada na edição.
- Mapa das mesas (quem atende na mesa): livre em cinza, ocupada em laranja com o total. Tocar na livre lança o pedido; na ocupada abre a conta (lançar mais, fechar mesa, passar para outra mesa ou juntar). Mesa extra com nome. Fechar mesa: consumo + taxa de serviço (o cliente pode não pagar), um pagou tudo, dividiram (igual ou cada um um valor) ou pagaram separado sem anotar.
- Editar (com aviso se outra pessoa alterou) e cancelar com motivo.
- Nome ou mesa no pedido; a conta de cada mesa soma a noite toda e fecha de uma vez. Forma de pagamento na hora ou depois.
- Sem internet: o pedido fica guardado no aparelho e sai sozinho quando a conexão volta, sem duplicar. Faixa fixa logo abaixo do cabeçalho em todas as telas (`FaixaDeInternet`, em `src/components/ui/AvisosDeInternet.jsx`) com quantos pedidos estão guardados e "Não lance de novo"; cada pedido da fila mostra "Esperando internet". Quando um pedido guardado sai, o aviso "Agora é o 014: diga ao cliente" aparece em qualquer tela (`SaidasDaFila`, guardado em `organiza-fila-saidas-<id>`) e, em Pedidos, no próprio aviso de enviado.
- Toque em produto esgotado registrado (venda que teria saído errada).
- Modo sem tela de cozinha: o "Pronto" fica na tela de pedidos.

### Fase 4. Cozinha em tempo real — pronta
- Fila única do que falta fazer, do mais antigo para o mais novo; atraso a partir de 15 minutos.
- "Pronto" em um toque com "Desfazer"; "Faltou" diz qual ingrediente faltou (ou o item inteiro, se o produto não tem ingredientes) e avisa o atendente e o cliente.
- Esgotados: "Acabou um ingrediente?" esgota de uma vez os produtos que o levam.
- Aviso de pedido alterado ou cancelado (destaque, bipe e leitor de tela); tela sempre acesa; aba de esgotados.
- Som sempre ligado (regra em `src/lib/somDaCozinha.js`): com a fila vazia, pedido novo toca o som forte (três notas, duas vezes); com pedido na tela, só um "tic" curto e baixo, no máximo um a cada 30 s; pedido alterado ou cancelado sempre toca dois bipes; pedidos que chegam juntos tocam um som só; o "Pronto" do próprio cozinheiro não toca. Som normal ou bem alto e "Testar som" ficam em "Som e tela" (fechado, para a fila aparecer sem rolar no celular), com o lembrete do volume do aparelho e, em celular e tablet, o de deixar só o Organiza+ aberto. Pedido que chega com outro app na frente gera um aviso quando a pessoa volta.
- Faixa "+N pedidos novos" (automática): fixa logo abaixo do cabeçalho, conta só os pedidos novos que ainda não apareceram na tela (IntersectionObserver, `useNovosForaDaTela`) e leva até eles. Modo foco opcional ("Pedidos na tela": todos, 1, 2 ou 3 por vez, guardado no aparelho): cartões grandes e o resto como "+N na fila (X novos)". Abrindo a Cozinha direto, o navegador só libera o som depois do primeiro toque, e a tela avisa ("Toque para ligar o som"). Vibração junto com o som, aviso de "Reconectando" com conferência a cada 8 s e cabeçalho compacto no tablet deitado.
- Modo monitor (`/cozinha?modo=monitor`): a fila numa TV ou tablet da cozinha, sem o menu do sistema, com alto contraste fixo (fundo preto) nos dois temas, posição de cada pedido na fila (1º, 2º…), mesa em destaque e tela cheia.
- Bebida (produto que não vai para a cozinha) aparece só como lembrete no cartão.

### Fase 5. Relatórios — pronta
- Hoje, 7 e 30 dias; faturamento, pedidos, ticket médio, lucro, mais vendido × mais lucrativo, gráfico por dia (faturamento e pedidos), pedidos por hora com horário de pico, o que mais faltou na cozinha, aviso de reposição e planilha CSV.
- Cancelados e não recebidos (foram embora sem pagar) ficam fora das contas e aparecem à parte: cancelados por motivo, não recebidos com o valor perdido.
- Tempo até ficar pronto (mediana e quantos passaram de 15 min). O "dia" respeita a virada do negócio.
- Caixa (`/caixa`): "Encerrar o dia" (com a lista do que resolver antes), recebido por Pix, dinheiro, crédito e débito, o que falta receber, o que falta devolver ("Devolvi") e o não recebido ("Desfazer"). O dia de ontem mostra "Caixa não fechado" enquanto tiver pendência.

### Fase 6. Página do cliente via QR code — pronta
- O dono escolhe o nome mostrado, imprime o cartaz, desliga a página ou troca o endereço.
- O cliente digita a senha do pedido e acompanha posição na fila, tempo médio e o aviso de pronto, sem cadastro.

### Fase 7. Conta e LGPD — pronta
- Minha conta: nome, nome do negócio, senha (pede a atual), "Como você atende" (balcão, mesa ou os dois; aparelho na cozinha; mesas e taxa de serviço), sair de todos os aparelhos e excluir conta (pede a senha). "Sair" desconecta só o aparelho.
- Política de privacidade (`/privacidade`) e Ajuda (`/ajuda`) com as dúvidas da validação de campo.
- Contato da equipe para ajuda (joaoemanuel15@edu.unifor.br, em `src/lib/contato.js`): no rodapé da landing, das telas de acesso e do painel, na Ajuda e na política de privacidade.
- Tela que se recupera sozinha depois de um deploy (ErroDaTela e recarga) e workflow de saúde a cada 6 h.
- "Travou?" sempre no topo (e no rodapé do painel) leva a `/ajuda#travou`: três passos (puxar a tela, sem internet não lance de novo, anotar no papel) e o contato da equipe. Grupo de ajuda no WhatsApp só dentro do sistema, quando `GRUPO_WHATSAPP` estiver preenchido.
- Aviso de navegador de dentro de outro app (Instagram, Facebook, WhatsApp, TikTok etc., em `src/lib/aparelho.js`): explica como abrir no Chrome ou no Safari e copia o endereço; some com "Entendi" e não aparece na página do cliente.
- Ícone na tela do celular: passo opcional no fim das boas-vindas, só em celular ou tablet que ainda não abriu como app ("Agora não" guarda a escolha). No Android usa o aviso de instalar do Chrome (um toque, capturado cedo em `src/lib/instalar.js`); no iPhone mostra os passos do Safari. Fica também na Ajuda. Manifesto com ícones 192 e 512.
- Criar conta responde as perguntas de quem ainda está decidindo (custo, aparelho, cardápio, internet, papel, dados), ao lado do formulário no computador e abaixo dele no celular.

### Próximos passos
- Supabase e Vercel no ar e teste do fluxo completo com dados reais.
- Decisões em aberto: contas de equipe por papel, adicionais pagos, abrir telas sem internet (o ícone na tela já existe, mas ainda precisa de internet para abrir).

## Regra geral para todas as fases

Cada fase deve ser implementada de forma independente e funcional antes de avançar para a próxima.
