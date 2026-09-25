# Back-end: o que falta e onde o front já espera por isso

Lista para quem for cuidar do Supabase e da infraestrutura (back-end: Lauan; DevOps: Antonio). O front-end das Fases 1 a 5 já existe e roda em **modo demonstração**, com os dados salvos no `localStorage` do navegador, enquanto o Supabase não estiver configurado. Assim que `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` existirem, o mesmo código passa a usar o banco real, sem mudar nenhuma tela.

Toda a comunicação com o banco está em `src/services/` e `src/context/AuthProvider.jsx`. Nenhuma tela chama o Supabase direto.

## Para colocar no ar (obrigatório)

1. **Criar o projeto Supabase** (plano free) e rodar `supabase/schema.sql` no SQL Editor.
2. **Revisar e rodar** `supabase/migrations/20260924_proposta_fase1_cadastro_realtime_pedido.sql`. Ele faz três coisas:
   - cria um trigger que monta o negócio e o perfil admin a partir do cadastro (`nome`, `nome_negocio` em `raw_user_meta_data`). Sem ele, quem se cadastra fica logado, mas cai na mensagem "Sua conta ainda não está ligada a um negócio";
   - publica `produtos`, `pedidos` e `itens_pedido` no Realtime. Sem isso a Cozinha só atualiza ao recarregar a página;
   - cria a função `criar_pedido` (ver item 5) e índices.
3. **Variáveis de ambiente**: `.env.local` (cada dev) e Environment Variables na Vercel, com a URL e a anon key (Project Settings → API).
4. **Auth → URL Configuration**: colocar o domínio da Vercel em Site URL e Redirect URLs, senão o link de confirmação de e-mail aponta para `localhost`.
5. **Confirmação de e-mail**: o front funciona com ela ligada ou desligada. Ligada, o cadastro mostra "Falta só confirmar"; desligada, entra direto no painel. Decidir com a equipe. Para os testes com os empreendedores, desligar reduz atrito.
6. **Vercel**: o `vercel.json` na raiz já redireciona todas as rotas para `index.html`, para abrir `/cozinha` direto funcionar. Build: `npm run build`, saída `dist`.

## Melhorias recomendadas

Por ordem de impacto:

- **Pedido atômico (`criar_pedido`)**: hoje `criarPedido` em `src/services/pedidos.js` faz dois inserts (pedido, depois itens) e manda o `preco_unitario` do cliente. Se o segundo falhar, o front apaga o pedido, mas não é transação. A função SQL proposta resolve e ainda pega o preço do banco. Para usar, trocar o bloco marcado com `TODO(backend)` por `supabase.rpc('criar_pedido', { itens })`.
- **Identificar o pedido**: hoje a equipe chama o pedido pelo código curto `#A3F9` (4 primeiros caracteres do uuid). Seria melhor ter um número sequencial por dia (`numero int`) e um campo opcional `cliente text` (nome ou mesa). Também falta `observacao text` ("sem cebola"). O front mostra isso fácil quando a coluna existir.
- **Excluir produto já vendido**: a FK de `itens_pedido.produto_id` impede a exclusão (o front mostra "marque como esgotado"). Se a equipe quiser remover do cardápio de vez, criar `ativo boolean default true` e filtrar por ele, sem apagar a linha.
- **Custo histórico**: o relatório calcula o lucro com o custo **atual** do produto. Se o custo mudar, o lucro de dias antigos muda junto. Para congelar, adicionar `custo_unitario` em `itens_pedido`, gravado na hora do pedido, igual ao preço.
- **Papéis (`atendente`, `cozinha`)**: o schema prevê, mas ainda não há como convidar funcionários nem policies por papel (por exemplo, atendente não edita produtos). Hoje todo mundo é `admin` do próprio negócio.
- **Relatórios no banco**: hoje o cálculo é feito no navegador (`src/services/relatorios.js`), o que basta para o volume de um pequeno negócio. Se ficar pesado, virar uma view ou função SQL.

## LGPD

- Página de política de privacidade (o que coletamos: nome, e-mail, nome do negócio, pedidos; para quê; como pedir exclusão).
- Forma de o dono excluir a conta e os dados (o `on delete cascade` do schema já apaga tudo a partir de `negocios`).
- Não guardar nada de cliente final além do que o negócio digitar no pedido.

## Métricas para o relatório do TCC

Sem analytics de terceiros. Tudo sai das próprias tabelas:

```sql
-- negócios cadastrados e ativos (com pedido nos últimos 7 dias)
select count(*) from negocios;
select count(distinct negocio_id) from pedidos where criado_em > now() - interval '7 days';

-- pedidos por dia
select date_trunc('day', criado_em) as dia, count(*) from pedidos group by 1 order by 1;
```

Para "tempo de preparo", seria preciso gravar quando o status muda (`pronto_em timestamptz`). Hoje só existe `criado_em`.
