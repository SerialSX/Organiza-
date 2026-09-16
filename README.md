# 🟣 Organiza+

> Central digital prática e simplificada para apoiar a sobrevivência e o crescimento de pequenos negócios — combatendo a alta taxa de mortalidade precoce de microempresas.

![React Native](https://img.shields.io/badge/React_Native-0.86-61DAFB?logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK_57-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📌 Sobre o Projeto

O **Organiza+** nasceu de um problema real: no Brasil, **quase metade das microempresas fecha antes de completar 3 anos**. O pequeno empreendedor — especialmente o de comida de rua — não quer e **rejeita sistemas complexos ou caros**. Ele precisa de ferramentas diretas, intuitivas e de uso imediato.

A proposta é entregar uma central digital que vai além da gestão operacional, abrangendo também saúde mental, capacitação e divulgação — tudo em um só lugar, sem burocracia.

### 🎯 Público-Alvo

- **Nicho prioritário:** Empreendedores de **comida de rua** (food trucks, trailers, barracas, ambulantes) e pequenos comércios de bairro em **Fortaleza/CE**
- Trabalha sozinho ou com apoio informal da família
- Empreende por **necessidade**, não por oportunidade
- 7 em cada 10 estão na **informalidade**
- Sofre de sobrecarga de funções (compra, produz, atende, cobra e limpa)

---

## 🧩 Os 4 Pilares

| Pilar | O que oferece | Objetivo |
|-------|---------------|----------|
| 💼 **Gestão** | Calculadora de preço de venda, fluxo de caixa simplificado, modelos de contrato e checklists operacionais | Controlar o dinheiro e operações sem planilhas complexas |
| 🧠 **Saúde** | E-book de saúde mental, diário de bem-estar e apoio à sobrecarga | Cuidar do empreendedor que carrega o negócio sozinho |
| 📚 **Educação** | Trilhas curtas, e-books e direcionamento para cursos do **Sebrae** | Estimular capacitação contínua e formalização (MEI) |
| 📣 **Marketing** | Templates prontos para redes sociais e calendário de conteúdo | Divulgação simples sem depender de agência |

---

## 🎨 Identidade Visual

- **Modo escuro** (padrão): fundo azul-escuro profundo com acentos em roxo
- **Modo claro**: fundo claro com roxo como cor de destaque
- Gradientes em **elementos de destaque** (botões, headers) — não no fundo inteiro
- Cores de status: 🟢 verde para "pago/confirmado" · 🟠 âmbar para "pendente"

---

## 🚀 Como Rodar

### Pré-requisitos

- [Node.js](https://nodejs.org/) (v18+)
- [Expo Go](https://expo.dev/go) no celular

### Instalação

```bash
# Clone o repositório
git clone https://github.com/SerialSX/Organiza-.git
cd Organiza-

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npx expo start
```

Escaneie o QR code com o **Expo Go** ou abra em um emulador.

---

## 📂 Estrutura do Projeto Atualmente

```
Organiza-/
├── src/
│   ├── app/               # Telas (file-based routing)
│   │   ├── _layout.tsx     # Layout raiz
│   │   ├── index.tsx       # Home — hub principal
│   │   └── cadastro.tsx    # Tela de cadastro
│   ├── components/         # Componentes reutilizáveis
│   ├── constants/
│   │   └── theme.ts        # Paleta de cores e tokens de design
│   └── hooks/              # Hooks customizados (useTheme, etc.)
├── assets/                 # Imagens e ícones
├── app.json                # Configuração do Expo
├── package.json
└── tsconfig.json
```

---

## 🛠️ Stack

- **[Expo](https://expo.dev/)** — plataforma de desenvolvimento React Native
- **[Expo Router](https://docs.expo.dev/router/introduction/)** — roteamento baseado em arquivos
- **[TypeScript](https://www.typescriptlang.org/)** — tipagem estática
- **[React Native](https://reactnative.dev/)** — framework mobile multiplataforma

---

## 👥 Equipe — UNIFOR (ADS)

| Membro | Função |
|--------|--------|
| **João Emanuel Rohsler** | Gestão de Projeto |
| **Éderson Façanha** | Desenvolvimento |
| **Lauan Moreira** | Desenvolvimento |
| **João Arthur Abreu** | Conteúdo |

---

## 📜 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](./LICENSE) para mais detalhes.

---

<p align="center">
  Feito com 💜 pela equipe Organiza+ — UNIFOR
</p>
