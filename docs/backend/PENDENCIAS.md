# Back-end: o que falta e onde o front já espera por isso

Lista para quem for cuidar do Supabase e da infraestrutura (back-end: Lauan; DevOps: Antonio). O front-end das Fases 1 a 5 já existe e roda em **modo demonstração**, com os dados salvos no `localStorage` do navegador, enquanto o Supabase não estiver configurado. Assim que `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` existirem, o mesmo código passa a usar o banco real, sem mudar nenhuma tela.

Toda a comunicação com o banco está em `src/services/` e `src/context/AuthProvider.jsx`. Nenhuma tela chama o Supabase direto.

## Para colocar no ar (obrigatório)

1. **Criar o projeto Supabase** (plano free) e rodar `supabase/schema.sql` inteiro no SQL Editor. Ele já traz:
   - tabelas, Row Level Security e permissões (pedidos e itens não aceitam escrita direta do cliente);
   - o trigger que monta o negócio e o perfil admin a partir do cadastro (`nome`, `nome_negocio` em `raw_user_meta_data`). Sem ele, quem se cadastra cai na mensagem "Sua conta ainda não está ligada a um negócio";
   - as funções `criar_pedido` e `atualizar_status_pedido`;
   - a publicação de `produtos`, `pedidos` e `itens_pedido` no Realtime. Sem isso a Cozinha só atualiza ao recarregar a página.
2. Não rodar `docs/backend/referencia-mvp-main.sql`: é o schema do MVP antigo da `main`, guardado só como referência.
3. **Variáveis de ambiente**: `.env.local` (cada dev) e Environment Variables na Vercel, com a URL e a anon key (Project Settings → API).
4. **Auth → URL Configuration**: colocar o domínio da Vercel em Site URL e Redirect URLs, senão o link de confirmação de e-mail aponta para `localhost`.
5. **Confirmação de e-mail**: o front funciona com ela ligada ou desligada. Ligada, o cadastro mostra "Falta só confirmar"; desligada, entra direto no painel. Decidir com a equipe. Para os testes com os empreendedores, desligar reduz atrito.
6. **Vercel**: o `vercel.json` na raiz já redireciona todas as rotas para `index.html`, para abrir `/cozinha` direto funcionar. Build: `npm run build`, saída `dist`.

## Já resolvido (merge da `main` na `dev`, 29/09)

A lógica de banco do MVP da `main` foi portada para o schema da `dev`:

- **Pedido atômico**: `criar_pedido` grava pedido e itens numa transação, lê preço e custo do banco e recusa produto esgotado ou arquivado. O front só manda `produto_id` e `quantidade`.
- **Status validado**: `atualizar_status_pedido` só deixa avançar (pendente → em_preparo → pronto → entregue).
- **Excluir produto**: arquiva (`arquivado = true`) em vez de apagar, então pedidos antigos continuam com o nome do produto.
- **Custo histórico**: `itens_pedido.custo_unitario` guarda o custo da hora do pedido, e o relatório usa esse valor.

## Melhorias recomendadas

Por ordem de impacto:

- **Identificar o pedido**: hoje a equipe chama o pedido pelo código curto `#A3F9` (4 primeiros caracteres do uuid). Seria melhor ter um número sequencial por dia (`numero int`) e um campo opcional `cliente text` (nome ou mesa). Também falta `observacao text` ("sem cebola"). O front mostra isso fácil quando a coluna existir.
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
