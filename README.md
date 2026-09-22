# Organiza+

Sistema web para organizar o fluxo de pedidos de pequenos negócios de comida de rua (food trucks, trailers, barracas e lanchonetes pequenas), conectando em tempo real quem lança o pedido (garçom/balcão) e quem prepara na cozinha — evitando pedidos anotados errado, esquecidos ou vendidos depois de esgotados.

Projeto de extensão acadêmica do curso de Análise e Desenvolvimento de Sistemas da Unifor, gratuito e sem fins lucrativos.

## Como rodar localmente

Pré-requisito: [Node.js](https://nodejs.org/) 18+.

```bash
git clone https://github.com/SerialSX/Organiza-.git
cd Organiza-
npm install
cp .env.example .env.local   # preencha com as chaves do seu projeto Supabase
npm run dev
```

Abra o link mostrado no terminal (geralmente `http://localhost:5173`).

Outros comandos úteis:

```bash
npm run build     # build de produção
npm run preview   # serve o build localmente
npm run lint      # checagem de lint
```

O schema do banco de dados (tabelas + Row Level Security) está em [`supabase/schema.sql`](./supabase/schema.sql) — rode no SQL Editor do seu projeto Supabase.

## Stack

- **[React](https://react.dev/)** + **[Vite](https://vitejs.dev/)** — interface e build
- **[React Router](https://reactrouter.com/)** — roteamento entre páginas
- **[Tailwind CSS](https://tailwindcss.com/)** — estilo
- **[Supabase](https://supabase.com/)** — banco de dados (Postgres), autenticação e tempo real

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
