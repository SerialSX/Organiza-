# Organiza+

Sistema web para organizar o fluxo de pedidos de pequenos negócios de comida de rua (food trucks, trailers, barracas e lanchonetes pequenas), conectando em tempo real quem lança o pedido (garçom/balcão) e quem prepara na cozinha — evitando pedidos anotados errado, esquecidos ou vendidos depois de esgotados.

Projeto de extensão acadêmica do curso de Análise e Desenvolvimento de Sistemas da Unifor, gratuito e sem fins lucrativos.

## Como rodar localmente

Pré-requisito: [Node.js](https://nodejs.org/) 18+.

```bash
git clone https://github.com/SerialSX/Organiza-.git
cd Organiza-
npm install
npm run dev
```

Abra o link mostrado no terminal (geralmente `http://localhost:5173`).

**Sem configurar nada, o sistema abre em modo demonstração**: os dados ficam salvos só no seu navegador e não há login real. Dá para testar o fluxo inteiro (cadastrar produtos, lançar pedidos, ver a cozinha e os relatórios). Abra Pedidos e Cozinha em duas abas para ver o pedido chegar na hora.

Para usar o banco de verdade:

```bash
cp .env.example .env.local   # preencha com a URL e a anon key do projeto Supabase
```

No SQL Editor do Supabase, rode [`supabase/schema.sql`](./supabase/schema.sql) e depois os arquivos de [`supabase/migrations/`](./supabase/migrations/). O que ainda falta no back-end está em [`docs/backend/PENDENCIAS.md`](./docs/backend/PENDENCIAS.md).

Outros comandos úteis:

```bash
npm run build     # build de produção
npm run preview   # serve o build localmente
npm run lint      # checagem de lint
npm test          # testes automatizados (Vitest)
```

## Stack

- **[React](https://react.dev/)** + **[Vite](https://vitejs.dev/)** — interface e build
- **[React Router](https://reactrouter.com/)** — roteamento entre páginas
- **[Tailwind CSS](https://tailwindcss.com/)** — estilo
- **[Supabase](https://supabase.com/)** — banco de dados (Postgres), autenticação e tempo real
- **[Vitest](https://vitest.dev/)** — testes automatizados

Detalhes da arquitetura, modelo de dados e plano de fases em [`ARQUITETURA.md`](./ARQUITETURA.md).

## Identidade visual

Fundo escuro (`#0A192F`) com laranja (`#EE9448`) como cor de destaque.

## Equipe

| Nome | Função |
| ---- | ------ |
| João Emanuel Rohsler | Gestão de Projeto e Arquitetura |
| Éderson Façanha | Desenvolvimento Front-end |
| Lauan Moreira | Desenvolvimento Back-end e Banco de Dados |
| João Arthur Abreu | Testes e Qualidade (QA) |
| Antonio de Macedo | Infraestrutura e DevOps |

## Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](./LICENSE) para mais detalhes.
