# Organiza+

Sistema web para organizar o fluxo de pedidos de pequenos negócios de comida de rua (food trucks, trailers, barracas e lanchonetes pequenas), conectando em tempo real quem lança o pedido (garçom/balcão) e quem prepara na cozinha — evitando pedidos anotados errado, esquecidos ou vendidos depois de esgotados.

Projeto de extensão acadêmica do curso de Análise e Desenvolvimento de Sistemas da Unifor, gratuito e sem fins lucrativos.

## Como rodar localmente

Pré-requisito: [Node.js](https://nodejs.org/) 20.19 ou mais novo.

```bash
git clone https://github.com/SerialSX/Organiza-.git
cd Organiza-
npm install
npm run dev
```

Abra o link mostrado no terminal (geralmente `http://localhost:5173`).

**Sem configurar nada, o sistema abre em modo demonstração**: os dados ficam salvos só no seu navegador e não há login real. Dá para testar o fluxo inteiro: cadastrar produtos, lançar, editar e cancelar pedidos, ver a cozinha, os relatórios e a página do cliente via QR code. Abra Pedidos e Cozinha em duas abas para ver o pedido chegar na hora.

Para usar o banco de verdade:

```bash
cp .env.example .env.local   # preencha com a URL e a anon key do projeto Supabase
```

No SQL Editor do Supabase, rode o arquivo [`supabase/schema.sql`](./supabase/schema.sql) inteiro. Em Authentication → URL Configuration, coloque o endereço do site em Site URL e adicione `/home` em Redirect URLs (link de confirmação de e-mail). Em Authentication → Email Templates → Reset Password, o e-mail precisa mostrar `{{ .Token }}`: é o código de 6 dígitos do "Esqueci minha senha".

Se o banco já estava no ar, não rode o `schema.sql` de novo: rode só os arquivos de [`supabase/migracoes`](./supabase/migracoes) que ainda não rodaram, em ordem de data. Se faltar alguma, o sistema mostra um aviso vermelho para a equipe em todas as telas.

Em produção, sem as variáveis do Supabase o sistema mostra "fora do ar" em vez de cair no modo demonstração. Para publicar uma demonstração de propósito, defina `VITE_MODO_DEMO=true`.

## Comandos

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # build de produção
npm run preview      # serve o build localmente
npm run lint         # checagem de lint
npm test             # testes do front (Vitest)
npm run test:banco   # testes do supabase/schema.sql num Postgres local (PGlite)
npm run test:e2e     # testes de tela no navegador (Playwright): fluxo e acessibilidade
```

Na primeira vez, antes do `test:e2e`, rode `npx playwright install chromium`. Os testes de tela usam sempre o modo demonstração, mesmo com `.env.local` preenchido.

Todo PR para `dev` ou `main` roda lint, os testes do front e do banco, o build e os testes de tela (`.github/workflows/verificacao.yml`).

## Stack

- **[React](https://react.dev/)** + **[Vite](https://vitejs.dev/)** — interface e build
- **[React Router](https://reactrouter.com/)** — roteamento entre páginas
- **[Tailwind CSS](https://tailwindcss.com/)** — estilo
- **[Supabase](https://supabase.com/)** — banco de dados (Postgres), autenticação e tempo real
- **[Vitest](https://vitest.dev/)**, **[PGlite](https://pglite.dev/)** e **[Playwright](https://playwright.dev/)** — testes automatizados

Detalhes da arquitetura, modelo de dados e plano de fases em [`ARQUITETURA.md`](./ARQUITETURA.md).

## Identidade visual

Fundo escuro (`#0A192F`) com laranja (`#EE9448`) como cor de destaque. As telas seguem WCAG 2.1 AA (contraste, foco visível, leitor de tela).

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
