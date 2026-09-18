# CERNE.md — Documentação Viva do Código e Sistema (Go Team Go / Sport Scout Hub)

> **AVISO PARA INTELIGÊNCIAS ARTIFICIAIS (IAs)**:
> Este arquivo é a **documentação viva do sistema**. Toda e qualquer alteração realizada no código (seja inclusão, edição ou exclusão de função, componente, rota, modelo ou configuração) **DEVE SER OBRIGATORIAMENTE REFLETIDA NESTE ARQUIVO**.

---

## 1. Visão Geral do Sistema e Arquitetura

O **Go Team Go (Sport Scout Hub)** é uma plataforma SaaS para **Agências de Intercâmbio Esportivo** realizarem a gestão completa de atletas brasileiros em busca de bolsas e oportunidades esportivas/acadêmicas internacionais (especialmente nos EUA), além de disponibilizar um catálogo público de recrutamento para **Coaches (técnicos internacionais)**.

### Stack Técnica

- **Core / Framework**: [TanStack Start](https://tanstack.com/router/latest/docs/framework/react/start/overview) (`@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-query`) sobre **Vite** e **TypeScript 5**.
- **Interface & Estilização**: **Tailwind CSS v4** (`@tailwindcss/vite`), **shadcn UI** / **Radix UI**, Lucide Icons, design **Mobile-First** e regras consolidadas no guia oficial [`UI&UX.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/UI&UX.md).
- **Backend, Autenticação e Armazenamento**: **Supabase externo** (`@supabase/supabase-js`) com autenticação por E-mail/Senha, Row Level Security (RLS) e Buckets de Storage para mídias e documentos.
- **Geração de Propostas**: Geração dinâmica de propostas e exportação em PDF via `@react-pdf/renderer`.
- **Serviço de E-mail**: Arquitetura integrada ao **Amazon SES (Simple Email Service v2 via `@aws-sdk/client-sesv2`)** com Configuration Sets e tópicos SNS para captura de Bounces/Complaints, e-mails transacionais com janela comercial (`email_log`) e mailer de recrutamento em massa para coaches.
- **Qualidade & Testes**: **Vitest**, **ESLint**, **Prettier**.

### Governança de Planejamento Compartilhado

- **Pasta `think/`**: Repositório versionado dos raciocínios e planos de solução aprovados ou em análise. Todos os agentes devem ler integralmente seus arquivos Markdown antes de decidir ou alterar o projeto.
- **Registro prévio**: Todo plano apresentado ao usuário deve existir previamente como `think/YYYY-MM-DD-HHmm-descricao-curta.md`, contendo contexto, escopo, etapas, impactos, estratégia de validação e status de aprovação.
- **Continuidade entre agentes**: Os planos registram as decisões e alternativas consideradas, para que o agente seguinte preserve o contexto e não repita ou contradiga raciocínios anteriores.

### Build System & Package Manager

> **⚠️ CRÍTICO**: Este projeto utiliza exclusivamente **[Bun](https://bun.sh)** como package manager e runtime. **NÃO use npm, yarn ou pnpm** — tentativas de build com outros package managers resultarão em erros de dependências e compilação.

**Requisitos obrigatórios**:

- **Bun** >= 1.3.14 _(especificado em `package.json` → `"packageManager": "bun@1.3.14"`)_
- **Node.js** >= 20.19.0 _(especificado em `package.json` → `"engines": {"node": ">=20.19.0"}`)_

**Comandos de build**:

```bash
# Instalação de dependências
bun install

# Desenvolvimento local
bun run dev

# Build de produção
bun run build

# Validação completa (lint + typecheck + test + build)
bun run validate
```

**Arquivos de configuração**:

- [`package.json`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/package.json) — Scripts de build, dependências e versões fixadas de Bun/Node.js (incluindo `nitro` e `destr` em `devDependencies` para o preset Nitro da Vercel)
- [`vite.config.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/vite.config.ts) — Configuração do Vite usando `@lovable.dev/vite-tanstack-config` com preset `vercel` para Nitro
- [`tsconfig.json`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/tsconfig.json) — TypeScript 5+ com path alias `@/*` apontando para `src/*`
- [`vitest.config.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/vitest.config.ts) — Configuração de testes unitários com ambiente Node.js
- [`bunfig.toml`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/bunfig.toml) — Configurações específicas do Bun runtime
- [`vercel.json`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/vercel.json) — **[CRÍTICO]** Configuração de deploy forçando uso do Bun na Vercel (`installCommand: bun install`, `buildCommand: bun run build`). Sem este arquivo, Vercel usa npm e causa conflitos de peer dependencies.

**Deploy**:

- Build command para Vercel/Netlify/Cloudflare: `bun run build`
- Output directory: `.output/` (gerado pelo Nitro com preset Vercel)
- **Vercel**: O arquivo `vercel.json` é **obrigatório** para forçar uso do Bun. Sem ele, a Vercel usa npm por padrão, causando erros ERESOLVE com vite@8.1.5 vs vite@^5.0.0-7.0.0.
- Variáveis de ambiente: Consulte [`.env.example`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/.env.example) e [`docs/SETUP.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/docs/SETUP.md)

**Troubleshooting de build**: Consulte a seção 🔧 Troubleshooting no [`README.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/README.md) para soluções de erros comuns.

---

## 2. Conceitos Principais de Negócio

1. **Agência (Admin)**: Proprietária da plataforma com controle total. É o **único perfil que pode criar atletas**.
2. **Atleta**: Acessa a plataforma via convite por e-mail da Agência. Gerencia apenas seu próprio perfil, envia mídias/documentos e acompanha o progresso nas etapas do pipeline.
3. **Coach (Técnico)**: Acessa o **Feed Público** estilo streaming (cards estilo Netflix/Spotify) e páginas públicas dos atletas. Não acessa documentos confidenciais ou dados do pipeline.
4. **Pipeline de Estágios**: Fluxo de recrutamento por onde o atleta avança (ex: Cadastro -> Documentação -> Vídeos -> Propostas -> Finalização).
5. **Propostas Esportivas**: Documentos de oferta formal para atletas gerados pela agência, com suporte a visualização online com aceite do atleta e geração de PDF.

---

## 3. Mapeamento de Rotas e Telas (`src/routes`)

| Rota / Arquivo                                                                                                                                                                                    | Acesso / Perfil     | Descrição e Problema Resolvido                                                                                                                                                                                                                                                                                                                                                                                                              |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`src/routes/__root.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/__root.tsx)                                                   | Público             | Shell raiz da aplicação com `QueryClientProvider`, `AppProviders`, injeção de CSS global, manipulador de erros 404/Error Boundary e **[NOVO]** `loader` com `getAgencyVisual` para injeção dinâmica da logomarca da agência como favicon (`rel="icon"` e `rel="apple-touch-icon"`) e fallback automático para `/favicon.ico`.                                                                                                               |
| [`src/routes/index.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/index.tsx)                                                     | Público             | **Feed Público / Catálogo de Atletas**: Layout estilo streaming (cards de atletas com badge dinâmica "TRANSFER" para status universitário diferente de Junior, busca por nome, filtros recolhíveis por esporte/posição, carrosséis de destaques, seção de CTA institucional para contato e rodapé com assinatura animada "Powered by iasin.").                                                                                              |
| [`src/routes/athlete.$slug.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/athlete.$slug.tsx)                                     | Público             | **Perfil Público do Atleta**: Exibe bio, fotos, destaques, estatísticas de recrutamento, GPA, nível de inglês, conquistas para Coaches. **[ATUALIZADO]** Cabeçalho dinâmico sincronizado com `visual.logo_url` da agência (mesmas dimensões e fallback da Home), botão "Back to Catalog", hero cinematográfico de _Luxo Minimalista (Quiet Luxury)_, linha de Stories/Reels circulares e seção de vídeos _In Court_ e _Apresentação/Sobre_. |
| [`src/routes/login.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/login.tsx)                                                     | Público             | **Tela de Login**: Autenticação por e-mail e senha usando Supabase Auth.                                                                                                                                                                                                                                                                                                                                                                    |
| [`src/routes/forgot-password.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/forgot-password.tsx)                                 | Público             | Solicitante de e-mail para recuperação de senha.                                                                                                                                                                                                                                                                                                                                                                                            |
| [`src/routes/reset-password.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/reset-password.tsx)                                   | Autenticado (Token) | Redefinição de senha do usuário.                                                                                                                                                                                                                                                                                                                                                                                                            |
| [`src/routes/auth.accept-invite.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/auth.accept-invite.tsx)                           | Público (Token)     | Aceite de convite por novos atletas para definição de senha.                                                                                                                                                                                                                                                                                                                                                                                |
| [`src/routes/proposal.$token.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/proposal.$token.tsx)                                 | Público (Token)     | **Experiência Interativa da Proposta Esportiva**: Exibição da proposta enviada ao atleta com botões de aceite/recusa.                                                                                                                                                                                                                                                                                                                       |
| [`src/routes/proposal.$token.pdf.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/proposal.$token.pdf.tsx)                         | Público (Token)     | **Download/Stream de PDF**: Renderiza a proposta formatada em documento PDF via `@react-pdf/renderer`.                                                                                                                                                                                                                                                                                                                                      |
| [`src/routes/_authenticated/route.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/route.tsx)                       | Autenticado         | Layout pai autenticado com proteção de rotas e redirecionamento caso não haja sessão.                                                                                                                                                                                                                                                                                                                                                       |
| [`src/routes/_authenticated/admin/index.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/admin/index.tsx)           | Agência (Admin)     | Dashboard da Agência: Visão geral de métricas, atletas cadastrados e atalhos de gestão.                                                                                                                                                                                                                                                                                                                                                     |
| [`src/routes/_authenticated/admin/pipeline.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/admin/pipeline.tsx)     | Agência (Admin)     | **Gestão de Pipeline**: Quadro Kanban/Linha do tempo dos atletas em cada etapa de recrutamento.                                                                                                                                                                                                                                                                                                                                             |
| [`src/routes/_authenticated/admin/documents.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/admin/documents.tsx)   | Agência (Admin)     | **Central de Documentos**: Aprovação, reprovação e acompanhamento de arquivos enviados pelos atletas.                                                                                                                                                                                                                                                                                                                                       |
| [`src/routes/_authenticated/admin/settings.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/admin/settings.tsx)     | Agência (Admin)     | Configurações da Agência, etapas do pipeline e parâmetros do sistema.                                                                                                                                                                                                                                                                                                                                                                       |
| [`src/routes/_authenticated/admin/coaches.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/admin/coaches.tsx)       | Agência (Admin)     | **[NOVO] Gestão de Coaches Universitários**: Listagem, busca textual em tempo real, cadastro e edição manual, exclusão com confirmação e importação em massa via planilha (CSV/XLSX) com validação de formato de e-mail, prevenção de duplicados e resumo prévio de importação.                                                                                                                                                             |
| [`src/routes/_authenticated/portal/index.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/portal/index.tsx)         | Atleta              | **Home do Atleta**: Resumo do progresso, alertas de pendências de documentos e etapa atual. **Atualizado**: Integrado componente `<ConfettiCelebration />` que dispara animação quando URL contém `?celebrate=true`.                                                                                                                                                                                                                        |
| [`src/routes/_authenticated/portal/pipeline.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/portal/pipeline.tsx)   | Atleta              | Visualização detalhada do pipeline e etapas a cumprir.                                                                                                                                                                                                                                                                                                                                                                                      |
| [`src/routes/_authenticated/portal/documents.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/portal/documents.tsx) | Atleta              | **Envio de Documentos do Atleta**: Upload de PDFs, histórico de status e correções solicitadas pela agência.                                                                                                                                                                                                                                                                                                                                |
| [`src/routes/_authenticated/portal/media.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/portal/media.tsx)         | Atleta              | **Envio de Mídias**: Upload de fotos e links/vídeos de destaque para o perfil público.                                                                                                                                                                                                                                                                                                                                                      |

---

## 4. Componentes Principais (`src/components`)

- [`app-shell.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/app-shell.tsx): Layout estrutural responsivo com sidebar, navbar, menu mobile e perfil do usuário logado.
- [`stage-timeline.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/stage-timeline.tsx): Componente visual da linha do tempo e checklist interativo das etapas do atleta.
- [`proposal-experience.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/proposal-experience.tsx): Interface de leitura, navegação por blocos e aceite da proposta esportiva pelo atleta.
- [`proposal-pdf.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/proposal-pdf.tsx): Documento estilizado via `@react-pdf/renderer` para geração e exportação da proposta em formato PDF.
- [`athlete-access-card.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/athlete-access-card.tsx): Card de gerenciamento de dados de acesso e convites de atletas para a Agência.
- [`configuration-notice.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/configuration-notice.tsx): Tela explicativa exibida quando o ambiente não possui as chaves públicas do Supabase configuradas no `.env`.
- [`searchable-select.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/searchable-select.tsx): Seletor customizável com busca integrada para posições, esportes e países.
- [`reels-viewer.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/reels-viewer.tsx): **[ATUALIZADO]** Linha de destaques de Reels/Highlights em formato circular ("bolinhas" de Stories/Reels) com borda em gradiente dinâmico esmeralda/dourado e visualizador vertical 9:16 estilo TikTok/Instagram Reels com suporte a navegação por teclado e gestos touch.
- [`whatsapp-fab.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/whatsapp-fab.tsx): **[ATUALIZADO]** Botão flutuante para contato direto via WhatsApp oficial da agência com `IntersectionObserver` inteligente que detecta a aproximação do rodapé institucional (`<footer>`) e recolhe/desloca suavemente para evitar qualquer sobreposição indesejada.
- [`powered-by-iasin-signature.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/powered-by-iasin-signature.tsx): **[NOVO]** Componente reutilizável da assinatura "Powered by iasin." com traço SVG dinâmico e animado (`stroke-dasharray` / `stroke-dashoffset` via keyframes CSS `@keyframes iasin-stroke-draw`), disparado tanto ao entrar no viewport (`IntersectionObserver`) quanto no hover/focus do usuário, com suporte integral a acessibilidade e `prefers-reduced-motion`.
- [`public-youtube-player.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/public-youtube-player.tsx): Player responsivo para incorporação de vídeos do YouTube com suporte a aspect ratios customizáveis.
- [`reading-progress-bar.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/reading-progress-bar.tsx): **[NOVO]** Barra superior fixa de progresso de leitura em tom esmeralda (`h-1 z-50 bg-primary`) com medição otimizada via `requestAnimationFrame` e `aria-hidden="true"`.
- [`skeletons/catalog-skeleton.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/skeletons/catalog-skeleton.tsx): **[NOVO]** Skeleton acessível para o Catálogo público integrado via `pendingComponent` do TanStack Router.
- [`skeletons/athlete-profile-skeleton.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/skeletons/athlete-profile-skeleton.tsx): **[NOVO]** Skeleton acessível para o Perfil do Atleta integrado via `pendingComponent` do TanStack Router.
- [`send-recruit-email-dialog.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/send-recruit-email-dialog.tsx): **[NOVO]** Modal de seleção e disparo de e-mails para coaches universitários com preview WYSIWYG do e-mail do atleta, contadores dinâmicos, busca, seleção em lote e confirmação de envio.
- [`confetti-celebration.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/confetti-celebration.tsx): Componente de animação de confetes usando `canvas-confetti`. Dispara automaticamente quando o portal do atleta é acessado com parâmetro `?celebrate=true` (link vindo do e-mail de celebração). Cores emerald (#30b884) e gold (#eab308) do design system. Auto-remove o parâmetro da URL após 3 segundos de animação.
- [`ui/*`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/ui): Biblioteca de componentes atomizados (buttons, dialogs, badges, cards, inputs, dropdowns) construídos sobre Radix UI e Tailwind CSS.

---

## 5. Mapeamento de Módulos e Funções (`src/lib`)

- [`src/lib/auth.functions.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/auth.functions.ts): Funções de controle de sessão, login, registro de convites de atletas, atualização de perfis e verificação de papéis (`agency_admin`, `athlete`, `coach`).
- [`src/lib/athletes.functions.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/athletes.functions.ts): Funções CRUD e Server Functions para carregamento público e administrativo: `listPublicAthletes()` (catálogo), `getPublicAthlete()` (perfil do atleta com perfil, mídia, conquistas, vídeos, `nextAthlete` e `visual: AgencyVisualSettings | null`), `getAgencyVisual()` (Server Function leve para carregar `agency_visual_settings` na rota raiz `__root.tsx`) e `listAdminAthletes()`.
- [`src/lib/catalog.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/catalog.ts): Módulo de busca, ordenação e filtragem de atletas públicos para o feed dos Coaches.
- [`src/lib/proposals.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/proposals.ts) & [`proposals.functions.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/proposals.functions.ts): Lógica de criação, edição de blocos, publicação e alteração de status (aceito/recusado) de propostas.
- [`src/lib/uploads.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/uploads.ts): Utilitários para validação de formato/tamanho de arquivos e integração com os buckets do Supabase Storage.
- [`src/lib/error-capture.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/error-capture.ts) & [`lovable-error-reporting.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/lovable-error-reporting.ts): Captura resiliente de exceções em ambiente de runtime.

### 5.1 Sistema de E-mails Celebrativos (Novo - 2026-08-05)

- [`src/lib/email/placeholders.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/email/placeholders.ts): Utilitário de substituição de placeholders em templates de e-mail. Suporta 6 placeholders dinâmicos (`{{athlete_name}}`, `{{athlete_first_name}}`, `{{previous_stage}}`, `{{new_stage}}`, `{{agency_name}}`, `{{portal_link}}`) com função `replacePlaceholders()` type-safe e exemplos para preview.

- [`src/lib/email/sending-window.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/email/sending-window.ts): Lógica de janela inteligente de envios de e-mail. Respeita horários de descanso do atleta permitindo envios apenas em Segunda a Sexta-feira 08:00-12:00 e 13:00-19:00, Sábado 09:00-12:00 e 13:00-18:00. Fornece `isWithinSendingWindow()` para checagem e `getNextSendingWindowStart()` para cálculo da próxima janela disponível.

- [`src/lib/email/sending-window.test.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/email/sending-window.test.ts): Suite completa de testes Vitest cobrindo todos os cenários de janela de envio: manhãs e tardes de semana, sábados, domingos, horários de almoço e transições entre dias.

- [`src/lib/email/templates.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/email/templates.ts): Catálogo de templates de e-mail com novo template `stage_advancement_celebration` seguindo rigorosamente as especificações do [UI&UX.md](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/UI&UX.md) (Dark Premium theme, emerald/gold accents, Space Grotesk typography, 48px CTA button, mobile-first design).

- [`src/lib/email/email.server.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/email/email.server.ts): Serviço centralizado de e-mail via Resend. **Atualizado** com suporte a agendamento inteligente via parâmetro `respectSendingWindow`. Quando ativado, verifica a janela de envio e utiliza o parâmetro nativo `scheduled_at` do Resend para agendar e-mails fora do horário permitido. Registra status `"scheduled"` e timestamp `scheduled_for` na tabela `email_log`.

- [`src/lib/email/stage-change.server.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/email/stage-change.server.ts): Server Function `notifyStageAdvancementServerFn` que orquestra o envio de e-mails celebrativos quando atleta avança de etapa. Carrega mensagem customizada de `pipeline_stages.celebration_message_en`, substitui placeholders, monta dados do e-mail e dispara com respeito à janela de envio. Retorna informações de agendamento quando aplicável.

## Atualização 2026-08-25 — Seção Highlights na Home do Catálogo Público

- **Migration `0015_highlight_likes.sql`**: cria a tabela `athlete_video_likes` com colunas `id`, `video_id`, `athlete_id`, `user_fingerprint`, `created_at` e restrição UNIQUE (`video_id`, `user_fingerprint`), com permissões e RLS para inserção pública e leitura anônima/pública.
- **Trilha de Bolinhas na Home (`src/components/home-highlights-story-bar.tsx`)**:
  - Posicionada abaixo do hero e antes da barra de pesquisa e filtros do catálogo.
  - Scroll horizontal suave com suporte a swipe no mobile e botões com setas de navegação no desktop.
  - Cada bolinha contém a foto/avatar da atleta com anel de cor fixa laranja institucional (`#f69e00`), sem lógica de visto/não visto, e o nome da atleta em tipografia Quicksand Bold.
  - Ordenação automática pela atleta com highlight mais recente cadastrado primeiro.
  - Ao clicar em uma bolinha, abre o visualizador em tela cheia na posição exata do highlight daquela atleta.
- **Visualizador em Tela Cheia (`src/components/global-highlights-viewer.tsx`)**:
  - Feed vertical contínuo em proporção 9:16 com navegação por scroll/swipe vertical e atalhos de teclado (↑/↓, J/K, ESC, M para alternar áudio).
  - Percorre todos os highlights de todas as atletas de forma global e contínua.
  - Barra de progresso segmentada no topo com dados da atleta e botão de fechar.
  - Áudio mudo por padrão com toggle intuitivo e indicador em tela.
  - Overlay no canto inferior esquerdo com nome, posição em inglês e país da atleta.
  - Ações laterais flutuantes à direita:
    - **Curtir**: ícone de Estrelinha (`Star`) com persistência real em banco via `likeHighlightVideo`, atualização otimista instantânea e proteção anti-spam.
    - **Recrutar**: link direto para WhatsApp com mensagem personalizada pré-formatada para o recrutamento da atleta.
    - **Compartilhar**: aciona `navigator.share` (Web Share API) com fallback para cópia de link na área de transferência com notificação toast.
    - **Perfil**: navegação instantânea para o perfil público da atleta (`/athlete/$slug`).
- **Data Loaders e Server Functions (`src/lib/athletes.functions.ts`)**:
  - `listPublicAthletes()` agrega todos os vídeos do tipo `highlight` (e fallback de perfil) e consolida a contagem de likes em `highlightFeed` e `storyAthletes`.
  - `likeHighlightVideo()` permite o registro seguro de interesse de recrutadores e coaches.

## Atualização 2026-08-25 — Ajustes de Espaçamento/Contraste em Highlights e Badge Transfer no Catálogo

- **Espaçamento e Contraste na Seção de Highlights (`src/components/home-highlights-story-bar.tsx`)**:
  - `padding-top` expandido para `pt-9 md:pt-12` (com `pb-6 md:pb-8`), garantindo respiro e proporção harmônica em relação ao Hero e às demais seções da Home. O Hero permanece 100% inalterado em cores, gradientes e dimensões.
  - Tipografia de apoio ("Highlights · X Athletes") e posições das atletas com contraste aprimorado (`text-foreground/80` e `text-foreground/75`), garantindo conformidade estrita com o padrão WCAG AA de acessibilidade sobre o fundo verde-acinzentado.
- **Badge "TRANSFER" no Card do Atleta (`src/routes/index.tsx`)**:
  - Condicional atualizada no componente `AthleteCardItem`: a badge `"TRANSFER"` é exibida **exclusivamente** para atletas cujo status seja `Freshman`, `Sophomore`, `Junior` ou `Senior`.
  - Status como `Graduate Transfer`, `High School`, `Graduate`, `Transfer` (ou valores nulos/vazios) não ativam a badge.
  - O perfil individual do atleta (`/athlete/$slug`) mantém seu comportamento padrão de exibir o status real.

---

Entidades do PostgreSQL executadas no Supabase Externo:

- `agencies`: Dados da agência proprietária.
- `user_roles`: Mapeamento de usuários Auth e papéis (`agency_admin`, `athlete`, `coach`).
- `athletes`: Tabela principal do atleta (slug, nome, esporte, posição, agência, estágio atual, público/destaque).
- `athlete_profiles`: Informações estendidas (bio em PT/EN, vídeo de destaques, GPA, nível de inglês, estatísticas).
- `athlete_media`: Fotos e vídeos da galeria pública/privada do atleta.
- `achievements`: Conquistas, prêmios e medalhas.
- `pipeline_stages`: Fases do pipeline da agência (Key, Nomes PT/EN, Ordem). **Atualizado**: Nova coluna `celebration_message_en TEXT` para mensagem customizada de celebração enviada ao atleta ao avançar para esta etapa. Suporta placeholders dinâmicos.
- `athlete_stage_progress`: Progresso individual do atleta em cada etapa (Status: `not_started`, `in_progress`, `blocked`, `completed`).
- `documents`: Documentos enviados (PDF, PNG, JPG) armazenados no Supabase Storage.
- `email_log`: Registro de todos os e-mails enviados pela plataforma. **Atualizado**: Nova coluna `scheduled_for TIMESTAMPTZ` para rastrear quando e-mails agendados serão enviados via Resend.
- `coaches`: **[NOVO]** Cadastro de técnicos/coaches universitários (id, name, email, institution, created_at, updated_at) com busca e importação.
- `recruit_email_logs`: **[NOVO]** Log de auditoria dos e-mails teaser disparados para coaches (id, coach_id, athlete_id, sender_email, status, error_message, resend_email_id, created_at).
- `athlete_profiles.highlight_note`: **[NOVO]** Frase de gancho/destaque opcional configurada pela agência para os e-mails teaser de recrutamento.
- `proposals` & `proposal_versions`: Propostas esportivas formais e controle de versões.

### 6.1 Migração 0007: Stage Celebration Messages

**Arquivo**: [`db/migrations/0007_stage_celebration_messages.sql`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/db/migrations/0007_stage_celebration_messages.sql)

Esta migração adiciona:

1. Coluna `celebration_message_en TEXT` à tabela `pipeline_stages` - Permite agências configurarem mensagens celebrativas por etapa com suporte a 6 placeholders dinâmicos.
2. Coluna `scheduled_for TIMESTAMPTZ` à tabela `email_log` - Rastreia timestamp de agendamento para e-mails enviados fora da janela permitida.

---

## 7. Fluxo Completo: E-mail Celebrativo de Avanço de Etapa

### Visão Geral

Quando a Agência move um atleta para uma nova etapa no pipeline (via drag-and-drop no Kanban), o sistema automaticamente:

1. **Verifica Configuração**: Checa se a etapa de destino possui uma mensagem celebrativa configurada (`celebration_message_en`).
2. **Carrega Dados**: Busca informações do atleta, nome das etapas anterior/nova e nome da agência.
3. **Substitui Placeholders**: Aplica `replacePlaceholders()` na mensagem customizada da agência.
4. **Verifica Janela de Envio**: Se estiver dentro da janela permitida (Segunda-Sexta 8-12h/13-19h, Sábado 9-12h/13-18h), envia imediatamente. Caso contrário, agenda para a próxima abertura de janela via Resend `scheduled_at`.
5. **Envia E-mail**: Template premium mobile-first com tema Dark, acentos emerald/gold, título em Space Grotesk, card de transição de etapas e botão CTA de 48px linkando para o portal com `?celebrate=true`.
6. **Portal com Confetti**: Ao abrir o link, o portal do atleta dispara uma tempestade de confetes dourados e esmeraldas por 3 segundos.
7. **Notifica Admin**: Toast informativo no painel da agência indicando se e-mail foi enviado ou agendado, com horário previsto de envio.

### Componentes Envolvidos

- **UI**: [settings.tsx](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/admin/settings.tsx) (configuração), [pipeline.tsx](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/admin/pipeline.tsx) (trigger), [portal/index.tsx](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/portal/index.tsx) (confetti)
- **Lógica**: [stage-change.server.ts](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/email/stage-change.server.ts) (orquestração), [sending-window.ts](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/email/sending-window.ts) (janela), [placeholders.ts](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/email/placeholders.ts) (substituição)
- **Infraestrutura**: [email.server.ts](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/email/email.server.ts) (Resend), [templates.ts](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/email/templates.ts) (HTML), [confetti-celebration.tsx](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/confetti-celebration.tsx) (animação)
- **Dados**: Migration 0007, `pipeline_stages.celebration_message_en`, `email_log.scheduled_for`

### Decisões de Design

- **Opcional por Etapa**: Mensagem vazia = sem e-mail enviado (silenciosamente).
- **Apenas Inglês**: Campo `celebration_message_en` por decisão do usuário. Expansível para PT no futuro.
- **Agendamento Nativo**: Usa Resend `scheduled_at`, não cron jobs customizados.
- **Placeholders Type-Safe**: Interface `PlaceholderData` garante segurança de tipos na substituição.
- **Failure Graceful**: Falha no envio de e-mail não bloqueia movimentação de atleta no pipeline.

## Atualização 2026-08-05 — Disparo Resend na conclusão de etapa

- **Gatilho**: `src/components/stage-timeline.tsx` (modo editável/admin) chama `notifyStageAdvancementServerFn` via `useServerFn` quando uma etapa passa a `completed`. Falha de e-mail nunca bloqueia o salvamento da fase; o admin recebe toast de enviado, agendado ou aviso de falha.
- **Server Function**: `src/lib/email/stage-change.functions.ts` — wrapper fino com `inputValidator` e middleware `requireAgency` (somente a agência dispara). Importa a lógica sob demanda.
- **Lógica server-only**: `src/lib/email/stage-change.server.ts` — `sendStageCelebration()` carrega atleta, etapa, agência, aplica placeholders, monta `portal_link` a partir de `APP_URL` e envia com `respectSendingWindow: true`.
- **Anti-duplicidade**: consulta `email_log` por `template = stage_advancement_celebration` + `payload->>athleteId` + `payload->>stageId` com status `sent`/`scheduled`; se já existir, o envio é ignorado.
- **Kanban**: `src/routes/_authenticated/admin/pipeline.tsx` não dispara mais e-mail ao mover o atleta (o gatilho oficial é a conclusão da etapa).
- **Remetente**: `EMAIL_FROM` (fallback `Go Team Go <onboarding@resend.dev>` para testes até o domínio próprio ser verificado no Resend).
- **Variáveis de ambiente**: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` — server-only, nunca expostas ao navegador.

## Atualização 2026-08-06 — Pop-up de celebração no portal do atleta

- **Migração `0008_stage_portal_announcement.sql`**: colunas `portal_message_pt` / `portal_message_en` em `pipeline_stages`; tabelas `stage_celebration_images` (slider por etapa) e `athlete_stage_announcements` (controle de "já visto" por atleta+etapa) com GRANTs e RLS; bucket público `stage-celebrations` com escrita restrita a `is_agency_admin()`.
- **`src/hooks/use-stage-announcement.ts`**: detecta a etapa avançada ainda não vista (com mensagem configurada), resolve placeholders, carrega as imagens e expõe `dismiss()` que grava em `athlete_stage_announcements`.
- **`src/components/stage-celebration-dialog.tsx`**: dialog com título da etapa, mensagem e slider próprio (setas/indicadores só com múltiplas imagens; nada é renderizado sem imagens). Confetes disparam uma vez atrás do dialog.
- **`src/components/confetti-celebration.tsx`**: rotina extraída para `fireConfetti({ duration, zIndex })`, reutilizada pelo dialog.
- **Telas**: dialog montado em `portal/pipeline.tsx` e `portal/index.tsx`; configuração (texto + upload/reordenar/remover imagens) na edição de etapa em `admin/settings.tsx`.

## Atualização 2026-08-16 — Correção de falhas silenciosas no pipeline de vídeos

- **`src/routes/_authenticated/admin/athletes/$id.tsx` → `load()`**: adicionado `if (videosResult.error) toast.error(...)` — se a tabela `athlete_videos` não existir ou a RLS bloquear, o admin exibe mensagem de erro em vez de listar vazio sem aviso.
- **`src/routes/_authenticated/admin/athletes/$id.tsx` → `save()`**: removido bloco duplicado de insert/update de vídeo sem tratamento de erro; substituído por `await addVideo()` que já possui `if (error) return toast.error(...)` correto.
- **`src/lib/athletes.functions.ts` → `getPublicAthlete()`**: adicionado `if (videos.error) console.error(...)` para surfaçar falhas da query `athlete_videos` nos logs do servidor.
- **`src/lib/athletes.functions.ts` → `listPublicAthletes()`**: adicionado `if (videosResult.error) console.error(...)` pelo mesmo motivo.
- **Pré-requisito para vídeos funcionarem**: migrations `0009_visual_settings_media.sql` e `0010_athlete_profile_fields.sql` precisam ser aplicadas no Supabase externo antes de qualquer operação com `athlete_videos`.

## Atualização 2026-08-15 — Aba Visual e catálogo portfólio

- **Migration `0009_visual_settings_media.sql`**: adiciona `agency_visual_settings`, `catalog_position_order` e `athlete_videos`, com grants públicos de leitura, escrita protegida por `is_agency_admin()` e leitura de vídeos limitada a atletas publicados.
- **Dados públicos**: `src/lib/athletes.functions.ts` passa a retornar configurações visuais, ordem de posições e vídeos YouTube. `sport_id` continua no schema, mas não participa do agrupamento público.
- **YouTube**: `src/lib/youtube.ts` valida URLs `watch`, `youtu.be`, `shorts` e `embed`, gerando embeds mudos e thumbnails. `YoutubeHoverPreview`, `use-in-view-autoplay` e `ReelsViewer` compõem a experiência de preview e reels.
- **Catálogo**: `src/routes/index.tsx` usa hero compacto, cabeçalho configurável, prateleiras por posição, selo semântico de destaque e WhatsApp flutuante.
- **Perfil público**: `src/routes/athlete.$slug.tsx` usa vídeos de destaque/apresentação, reels circulares, conquistas com imagem e WhatsApp flutuante.
- **Admin**: `src/routes/_authenticated/admin/visual.tsx` permite editar textos e ordenar posições; a ficha do atleta ganhou gerenciamento de links YouTube e thumbnails.
- **Operação**: a migration 0009 precisa ser executada no Supabase externo antes de usar a aba Visual.

## Atualização 2026-08-16 — Perfil público cinematográfico

- **Rota pública**: `src/routes/athlete.$slug.tsx` reforça a narrativa editorial do atleta com foto como âncora visual, vídeo `feature` como atmosfera do hero, CTA de recrutamento e atalho acessível para o destaque principal.
- **Vídeos**: a sequência pública fica organizada em Apresentação, Highlights e Destaque. Apresentação usa o título cadastrado quando disponível; Highlights continuam no `ReelsRow` com navegação vertical; Destaque ganha uma seção completa com âncora própria.
- **Compatibilidade YouTube**: `src/lib/youtube.ts` expõe `youtubeThumbnailUrl` como alias type-safe de `youtubeThumbnail` e usa o contrato de thumbnail `img.youtube.com`, mantendo os consumidores existentes compatíveis.
- **Fallbacks**: a informação essencial permanece disponível sem vídeo `feature`; o hero usa foto e dados do atleta mesmo quando o autoplay externo não estiver disponível.

## Atualização 2026-08-16 — Redesign do perfil público & campos estendidos (TASK-014)

- **Migration `0010_athlete_profile_fields.sql`**:
  - Adiciona 8 novos campos à tabela `athlete_profiles`: `subtitle` (subtítulo editável do hero), `current_school`, `high_school_graduation`, `seeking_opportunities`, `toefl_duolingo_score`, `budget`, `seasons_eligibility`, `team_contribution_en` (_What she/he brings to the team_).
  - Adiciona o valor `'in_court'` ao enum `public.athlete_video_kind`.
- **Tipos (`src/types/db.ts`)**: `AthleteProfile` e `AthleteVideoKind` atualizados com os novos campos e o novo tipo `'in_court'`.
- **Página Pública do Atleta (`src/routes/athlete.$slug.tsx`)**:
  - **100% em Inglês dos EUA**: Todos os textos, títulos, estatísticas e botões formatados em inglês americano.
  - **Hero Compacto com Efeito Atmosférico**: Foto como âncora visual (4:5) em destaque, vídeo _feature_ ao fundo com camada verde esmeralda translúcida + blur (`[oklch(0.22_0.08_162_/_0.78)] backdrop-blur-[5px]`), subtítulo editável por atleta vindo do admin, remoção do texto "Perfil de recrutamento", badges de posição/país/busca e botões "Recruit Athlete" + "Watch Featured".
  - **Highlights Instagram**: Bolinhas circulares com miniatura e título de reels, disparando player de tela cheia vertical com scroll infinito.
  - **Ficha Completa de Recrutamento (Key Recruiting Details)**: Grid estilizado com Position, Height, DOB, Current School, High School Graduation, Country, Seeking Opportunities, TOEFL/Duolingo Score, GPA, Budget e Seasons of Eligibility Left.
  - **Seção "What She/He Brings to the Team"**: Destaque editorial com o diferencial técnico e comportamental do atleta.
  - **Vídeo de Apresentação**: Player de apresentação do atleta.
  - **Vídeos "In Court"**: Grid dedicado para vídeos de jogos, partidas e jogadas em quadra (`kind: in_court`).
  - **Vídeo Destaque (Featured)**: Bloco completo com âncora `#featured-video`.
  - **Conquistas & Galeria**: Cards com troféus/medalhas e galeria de fotos.
  - **CTA de Recrutamento**: Bloco com botão WhatsApp e floating action button (`WhatsappFab`).
- **Painel Admin (`src/routes/_authenticated/admin/athletes/$id.tsx`)**:
  - Novos campos adicionados na aba "Perfil & mídia" para preenchimento de todos os 8 novos atributos.
  - Cadastro de vídeos do YouTube atualizado com suporte ao tipo "Em quadra (jogo)" (`in_court`), permitindo múltiplos vídeos com títulos opcionais.

## Atualização 2026-08-16 — Correção do pipeline de vídeos do YouTube & Reels (TASK-015)

- **Parser Resiliente (`src/lib/youtube.ts`)**:
  - `parseYoutubeId()` reescrito com estratégia combinada (Web `URL` API nativa + 5 regexes de fallback). Suporta 100% dos links do YouTube: `watch?v=ID`, URLs com parâmetros adicionais (`&feature=shared`, `&t=10s`, `?si=...`), `youtu.be/ID`, `shorts/ID`, `embed/ID`, `live/ID`, `v/ID` e `m.youtube.com`.
  - `youtubeEmbedUrl()` atualizado para usar o domínio universal `https://www.youtube.com/embed/${id}` com `enablejsapi=1`, `playsinline=1`, `rel=0` e `modestbranding=1`, eliminando restrições de embedding que falhavam em `youtube-nocookie.com`.
  - `youtubeThumbnail()` com geração canônica via `img.youtube.com`.
- **Reels Viewer Interativo (`src/components/reels-viewer.tsx`)**:
  - Carrossel de Highlights com miniaturas e fallback com ícone para evitar círculos vazios.
  - Overlay em tela cheia com controle reativo de índice ativo (`currentIndex`), botões de navegação lateral (setas para cima/baixo), suporte a toque/swipe vertical em smartphones e teclas do teclado (↑/↓/ESC).
  - Player vertical 9:16 com `allowFullScreen`, `gyroscope`, `picture-in-picture` e `web-share`.
- **Frames no Perfil Público (`src/routes/athlete.$slug.tsx`)**:
  - `YoutubePlayerFrame` atualizado com a propriedade explícita `allowFullScreen` e lista completa de permissões de reprodução.
  - Hero com fundo atmosférico com loop do vídeo de destaque e fallback para `profile.highlight_video_url`.
  - Testes unitários atualizados em `src/lib/youtube.test.ts`.

## Atualização 2026-08-18 — Experiência audiovisual no perfil público (TASK-019)

- **Hero com player funcional (`src/routes/athlete.$slug.tsx`)**: o vídeo `feature` (ou o melhor fallback disponível) deixou de ser uma textura de fundo sem interação e passou a ser um player acessível dentro do hero. Em mobile, ele segue o conteúdo em fluxo vertical; em desktop, compõe uma segunda coluna editorial.
- **Apresentação unificada**: a seção `Athlete Presentation` reúne o vídeo `presentation` e todos os vídeos `in_court`, com um player por vídeo e grid responsivo de uma coluna no mobile e duas no desktop.
- **Autoplay compatível**: todos os players da página pública usam `autoplay=1`, `mute=1` e `playsinline=1`. A reprodução sem áudio é necessária para que navegadores permitam autoplay consistente; controles e fullscreen continuam disponíveis para reprodução com áudio por decisão do visitante.
- **Reels visíveis (`src/components/reels-viewer.tsx`)**: highlights agora possuem players verticais 9:16 visíveis e em autoplay na página, além do visualizador em tela cheia com swipe, teclado e navegação por botões.
- **Dados seguros**: apenas URLs que geram embed válido são renderizadas; a consulta continua restrita pela RLS a atletas publicados e não arquivados.

## Camada visual do catálogo (migration 0009)

- `agency_visual_settings`: textos do hero e cabeçalho do catálogo (PT/EN), editáveis em `/admin/visual`.
- `catalog_position_order`: ordem manual das prateleiras por posição (consumida em `buildAthleteShelves`).
- `athlete_videos`: links do YouTube por atleta com `kind` = `presentation` | `highlight` | `feature` | `in_court`.
- Componentes: `athlete-video-card-media.tsx` (prévia em vídeo nos cards), `reels-viewer.tsx` (highlights em doom scroll), `whatsapp-fab.tsx` (botão flutuante).
- Helpers: `src/lib/youtube.ts` (`parseYoutubeId`, `youtubeThumbnail`, `youtubeEmbedUrl`).

## Atualização 2026-08-18 — Perfil público e vídeo confiável (TASK-022)

- **Contrato público de vídeos**: `src/lib/public-videos.ts` centraliza a validação, ordenação por `sort_order` e agrupamento em `feature`, `presentation`, `highlight` e `in_court`. Todas as apresentações e todos os vídeos em quadra válidos são exibidos; o hero usa a prioridade feature, destaque legado, apresentação, highlight e vídeo em quadra.
- **Player reutilizável**: `src/components/public-youtube-player.tsx` substitui embeds diretos no perfil e no visualizador de reels. Ele exibe thumbnail antes do carregamento, inicia o hero/reels automaticamente apenas sem áudio e quando movimento reduzido não foi solicitado, preserva controles/fullscreen e sempre fornece o link seguro “Watch on YouTube”.
- **Segurança e compatibilidade do YouTube**: `parseYoutubeId()` aceita somente IDs diretos e hosts oficiais (`youtube.com`, subdomínios oficiais e `youtu.be`), evitando que domínios arbitrários sejam convertidos em embeds. `youtubeWatchUrl()` fornece a URL canônica usada na contingência.
- **Reels e catálogo**: reels agora iniciam pelo poster e carregam somente o vídeo escolhido no overlay; cards do catálogo mantêm a foto e a prévia sob interação, desativando autoplay quando `prefers-reduced-motion` estiver ativo.
- **Diagnóstico operacional**: `getPublicAthlete()` expõe `videosAvailable`; a tela pública comunica indisponibilidade sem simular que o atleta não possui vídeos. O Admin orienta aplicar as migrations `0009` e `0010` quando a tabela ou o enum de vídeos não estiverem disponíveis.
- **Qualidade**: adicionados testes de agrupamento/ordenação e de rejeição de domínios indevidos. `bun run typecheck`, lint dos módulos alterados e `bun run build` concluíram. O Vitest focado não iniciou no Windows por `TypeError: File URL path must be an absolute path`, antes de carregar qualquer teste.

## Atualização 2026-08-20 — Entrega Home Pública, Identidade Visual & Sistema Imperial (TASK-030)

- **Bloco 1: Header & Navegação Pública**:
  - Removido o botão "Área restrita" e a tag "NCAA" do cabeçalho público (`src/routes/index.tsx`). O acesso ao painel de agência/atleta permanece direto e seguro pela rota `/login`.
  - Header adaptativo exibindo o logo da agência (`visual.logo_url`) ou o nome em tipografia display de alto contraste.
- **Blocos 2 e 3: Identidade Visual e Branding da Agência**:
  - **Migration `0012_agency_branding.sql`**: Adicionadas colunas `logo_url TEXT` e `hero_background_url TEXT` na tabela `agency_visual_settings`.
  - **Admin Visual (`src/routes/_authenticated/admin/visual.tsx`)**: Gerenciamento completo com upload para o bucket público do Supabase, pré-visualização ao vivo do logo e do banner do hero, validação de arquivo e botão de exclusão.
  - **Tipagem (`src/types/db.ts`)**: Interface `AgencyVisualSettings` atualizada.
- **Blocos 4 e 5.1: Redesign e Internacionalização do Catálogo (100% US English)**:
  - Textos, cabeçalhos, filtros, placeholders e badges padronizados em inglês americano no catálogo e na home.
  - Cards de atleta (`AthleteCardItem`) com foto/prévia em vídeo, nome e linha unificada de dados: Posição, Altura (Imperial) e País com bandeira.
  - Footer com logo/nome da agência, descrição da missão e direitos autorais.
  - Metatags Open Graph em inglês com fallback para fotos dos atletas.
- **Blocos 5.2 e 5.3: Sistema Imperial & Países ISO 3166**:
  - **Módulo `src/lib/units.ts`**: Funções `cmToFeetAndInches`, `formatHeightImperial` (ex: `5'11"`), `kgToLbs` e `formatWeightImperial` (ex: `172 lbs`) com cobertura completa de testes unitários (`src/lib/units.test.ts`).
  - **Perfil Público (`src/routes/athlete.$slug.tsx`)**: Altura e peso exibidos no formato imperial tanto no Hero quanto na lista de dados de recrutamento.
  - **Migration `0011_countries_iso.sql`**: Seed completo de 249 países e territórios no padrão ISO 3166-1 com nomes em inglês, português e emoji da bandeira.
- **Bloco 6: Centralização do WhatsApp**:
  - **Módulo `src/lib/contact.ts`**: Constante oficial `WHATSAPP_NUMBER = "5511917028611"` e funções auxiliares `buildWhatsappUrl()` e `buildRecruitWhatsappUrl(athleteName)`.
  - Mensagens em inglês formatadas para coaches internacionais (`"Hello, I am interested in recruiting..."`).

## Atualização 2026-08-21 — Pivot definitivo para 100% US English e Campo 'Course of Interest' (TASK-039 / TASK-031)

- **Pivot Definitivo para 100% US English**:
  - **Migration `0013_full_english_pivot_and_course_of_interest.sql`**:
    - `athlete_profiles`: remoção de `bio_pt` e adição da coluna `course_of_interest TEXT`.
    - `agency_visual_settings`: remoção de colunas redundantes em português (`hero_title_pt`, `hero_subtitle_pt`, `catalog_title_pt`, `catalog_subtitle_pt`).
    - `users`: atualização do locale padrão para `'en'`.
  - **Tipagem (`src/types/db.ts`)**:
    - `AthleteProfile`: adição de `course_of_interest: string | null` e remoção de `bio_pt`.
    - `AgencyVisualSettings`: interface 100% em inglês (`hero_title_en`, `hero_subtitle_en`, etc.).
  - **Painel Admin (`src/routes/_authenticated/admin/athletes/$id.tsx`)**:
    - Inclusão do campo **"Course of Interest / Intended Major"** com placeholder (`e.g., Business Administration, Sports Management, Computer Science`).
    - Exclusão do textarea de biografia em português (`bio_pt`), mantendo apenas **"Athlete Biography (English)"**.
    - Consultas de posições e países ordenadas exclusivamente por `name_en`.
  - **Perfil Público do Atleta (`src/routes/athlete.$slug.tsx`)**:
    - Adicionado **"Course of Interest"** na grade acadêmica e de elegibilidade (_Academic & Eligibility Details_).
    - Biografia, títulos, badges e posições consultam unicamente `name_en` e campos em inglês.
  - **Configurações e Visual Admin (`admin/settings.tsx`, `admin/visual.tsx`)**:
    - Removidos inputs bilíngues redundantes e unificada toda a interface em inglês dos EUA.
  - **Módulo de Catálogo e Notificações (`catalog.ts`, `stage-change.server.ts`, `use-stage-announcement.ts`)**:
    - Remoção de redundâncias de busca e categorização de posições em português, operando em 100% US English.
  - **Seed Demo (`db/demo_seed.sql`)**:
    - Dados de demonstração alinhados com a estrutura do pivot.

## Atualização 2026-08-22 — Ajustes no Perfil Público do Atleta & Admin (TASK-040)

- **Migration `0014_athlete_status_college_start.sql`**:
  - `athlete_profiles`: adicionadas as colunas `athlete_status TEXT` e `college_start_date TEXT`.
- **Tipos (`src/types/db.ts`)**:
  - Adicionado type `AthleteStatus = "High School" | "Freshman" | "Sophomore" | "Junior" | "Senior" | "Graduate Transfer"`.
  - Adicionados campos `athlete_status` e `college_start_date` em `AthleteProfile`.
- **Helpers & Formatação (`src/lib/units.ts` e `src/lib/units.test.ts`)**:
  - Criada função `formatGpa` para garantir exibição com pelo menos 1 casa decimal (ex: `4.0` ou `3.85`).
  - Adicionados testes de unidade com 100% de cobertura.
- **Página Pública do Atleta (`src/routes/athlete.$slug.tsx`)**:
  - **Hero**:
    - Subtítulo removido do layout editorial para máxima limpeza visual.
    - Labels de métricas renomeados para `HIGH SCHOOL GRAD.:` e `Current GPA:`.
    - Formatação de GPA aplicada com `formatGpa(profile?.gpa)`.
    - Botões "Watch Film" diretos no Hero apontando para links canônicos do YouTube (`youtubeWatchUrl`), abrindo em nova aba e exibindo múltiplos botões caso haja mais de um vídeo de film/highlight cadastrado.
  - **Sub-nav & Navegação Rápida**:
    - Removido o item e âncora "Highlights" da barra de navegação.
  - **Reels & Destaques Circulares**:
    - Removido o componente `ReelsRow` do perfil individual do atleta, preservando dados para a futura funcionalidade de subdomínio global (`reels.goteamgoagency.com`).
  - **Fact Sheet (Key Recruiting Details)**:
    - Campo renomeado: "High School Class" alterado para "High School Graduation".
    - Campo formatado: "Current GPA" usando `formatGpa`.
    - Campo removido: "Seasons Eligibility Left" removido.
    - Novos campos adicionados: "Athlete Status" e "College Start Date" exibidos quando preenchidos no Bloco 2 (Academic & Eligibility).
- **Painel Admin (`src/routes/_authenticated/admin/athletes/$id.tsx`)**:
  - Adicionado select para "Athlete Status" (High School, Freshman, Sophomore, Junior, Senior, Graduate Transfer).
  - Adicionado input para "College Start Date" (ex: Fall 2024, Spring 2025).
  - Removido o campo "Seasons of Eligibility Left" da ficha de edição.

## Atualização 2026-08-24 — Reordenação dos Cards, Tradução 100% US English & Simplificação dos Filtros do Catálogo (TASK-042)

- **Cards do Catálogo Público (`src/routes/index.tsx` - `AthleteCardItem`)**:
  - Reordenadas as informações de exibição nos cards de atletas na Home:
    - **Linha 1**: `Nome do Atleta` (`athlete.full_name`) em destaque editorial `font-display font-semibold`.
    - **Linha 2**: `Altura · Posição · Nacionalidade` (ex.: `5'10" · Setter · Brazil` ou com emoji `5'10" · Setter · 🇧🇷 Brazil`).
  - Assegurada a prioridade e tradução 100% US English para posição (`getAthletePositionEn`) e país (`getAthleteCountryEn`).
- **Dicionários e Normalização 100% US English (`src/lib/catalog.ts`)**:
  - Implementados dicionários completos de conversão PT/ISO -> US English: `POSITION_PT_TO_EN` e `COUNTRY_PT_TO_EN`.
  - Criadas funções utilitárias: `translatePositionToEn`, `translateCountryToEn`, `getAthletePositionEn`, `getAthleteCountryEn`, `getAthleteGradYear`, `getAthleteStatus`.
- **Card "Next Prospect" (`src/routes/athlete.$slug.tsx`)**:
  - Alinhada a descrição do próximo prospecto no rodapé para a mesma ordem e padrão US English: `Altura · Posição · Nacionalidade` (`formatHeightImperial(height_cm) · getAthletePositionEn(nextAthlete) · getAthleteCountryEn(nextAthlete)`).
- **Simplificação dos Filtros da Home (`src/routes/index.tsx`)**:
  - Remoção total do filtro de idade (`ageRange`), seus estados, botões de chip e contadores.
  - Estrutura consolidada em exatamente 4 filtros em chips horizontais mobile-first, na seguinte ordem obrigatória:
    1. **Position** (Setters, Outside Hitters, Middle Blockers, Liberos, Opposites, etc.)
    2. **High School Graduation Year** (extraído de `graduation_year` / `high_school_graduation`)
    3. **Country** (Brazil, United States, Argentina, Portugal, etc.)
    4. **Student Status** (High School, Freshman, Sophomore, Junior, Senior, Graduate Transfer)
  - Carregamento de perfil público atualizado em `src/lib/athletes.functions.ts` (`listPublicAthletes`) para carregar `high_school_graduation`, `graduation_year` e `athlete_status`.
- **Validação e Testes**:
  - `src/lib/catalog.test.ts` atualizado com testes de tradução e testes de filtragem combinada dos 4 filtros (100% aprovados).

## Atualização 2026-08-24 — Integração Google Analytics 4 (GA4) (TASK-043)

- **Telemetria & Analytics (`src/routes/__root.tsx`)**:
  - Adicionada a tag oficial do Google Analytics 4 (`gtag.js`) com o Measurement ID `G-4D6DTG650F` no elemento `<head>` da raiz do aplicativo (`RootShell`).
  - Implementado carregamento assíncrono não-bloqueante (`async`) junto à inicialização segura do `dataLayer` e disparo automático do `gtag('config', 'G-4D6DTG650F')`.
  - Zero impacto em tempo de renderização (FCP/LCP) e total compatibilidade com TanStack Start / SSR e Client Hydration.

## Atualização 2026-08-25 — Integração Microsoft Clarity (TASK-044)

- **Mapas de Calor & Gravação de Sessões (`src/routes/__root.tsx`)**:
  - Adicionada a tag oficial do Microsoft Clarity com o Project ID `y7zkn8qxno` no elemento `<head>` de `RootShell`.
  - Carregamento assíncrono com injeção dinâmica de script (`async=1`), operando em paralelo com Google Analytics 4 e Vercel Analytics.
  - Zero impacto em Core Web Vitals e total conformidade com o ecossistema TanStack Start.

## Atualização 2026-08-25 — Assinatura Institucional no Rodapé ("Powered by iasin.") (TASK-045)

- **Rodapé Público Padronizado (`src/routes/index.tsx` e `src/routes/athlete.$slug.tsx`)**:
  - Inserido o elemento de assinatura oficial do desenvolvedor (`<a href="https://iasin.dev.br" target="_blank">Powered by iasin.</a>`) com animações suaves de hover e respeito a `motion-reduce`.
  - Padronizado o `<footer>` no catálogo público e na página do atleta com branding institucional ("Go Team Go Agency"), copyright dinâmico e link responsivo `Powered by iasin.`.

## Atualização 2026-08-25 — Correção de Identidade Visual Oficial Go Team Go (Cores e Tipografia) (TASK-048)

- **Paleta de Cores Oficial (`src/styles.css`)**:
  - **Primária 1 (Laranja de Ação/Destaque)**: `#f69e00` — aplicada para botões primários (`liquid-button`), CTAs, badges de destaque, anéis de foto do atleta, links ativos e foco.
  - **Primária 2 (Verde Escuro Nobre / Base)**: `#032812` — aplicada para fundos sóbrios do Hero (catálogo e atleta), containers escuros (`glass-dark`), textos de contraste e bases institucionais.
  - **Apoio (Vermelho)**: `#ff1616` — aplicada pontualmente para alertas, indicadores de status crítico ou tags específicas.
  - **Apoio (Azul)**: `#114f8f` — aplicada para tags institucionais secundárias como "Introduction / Presentation Video".
  - **Apoio (Verde)**: `#084323` — aplicada para badges de "TRANSFER", "Match Play", chips de sucesso e gradientes secundários.
- **Tipografia Oficial**:
  - **Headings & Títulos Display**: `Tan St. Canard` com fallback atlético de alto impacto (`'Tan St. Canard', 'Bebas Neue', 'Teko', 'Impact', sans-serif`).
  - **Texto Geral / Body / Interface**: `Quicksand` (pesos 500, 600, 700 - Bold) importada via Google Fonts em `src/styles.css` e pré-carregada no `<head>` em `src/routes/__root.tsx`.
- **Componentes e Telas Atualizadas**:
  - `src/styles.css`: Definição centralizada de tokens de cores, variáveis CSS (`--primary`, `--primary-foreground`, `--color-brand-*`), fontes e utilitários (`glass-dark`, `liquid-button`, `eyebrow`).
  - `src/routes/index.tsx`: Hero em `#032812`, badges de posição e transfer em `#084323`, CTAs com `liquid-button` e botões de filtro alinhados.
  - `src/routes/athlete.$slug.tsx`: Hero em `#032812`, anel do retrato em `#f69e00`, botões Watch Film e WhatsApp com visual líquido e sombra profunda, sub-navegação com badges e destaques cromáticos.
  - `src/components/reading-progress-bar.tsx`: Barra de progresso de leitura com gradiente da marca (`#084323` -> `#f69e00` -> `#ffaa1a`).
- **Validação de Build**: Compilação de produção e tipagem TypeScript 100% verificadas (`compile_applet`).

## Atualização 2026-08-25 — Refinamento de Tipografia e Tokens Tailwind v4 (TASK-049)

- **Correção da Hierarquia Tipográfica e Textos (`src/styles.css` e `src/routes/__root.tsx`)**:
  - Eliminado o problema de forçar ALL-CAPS nos títulos através do novo stack display (`"Tan St. Canard", "Oswald", "Barlow Semi Condensed", "Space Grotesk", sans-serif`), permitindo suporte nativo a maiúsculas e minúsculas com alta legibilidade e impacto atlético.
  - Removida a imposição global de `font-weight: 600/700` no `body` e inputs, devolvendo fluidez e leitura natural aos parágrafos, fichas técnicas e placeholders na fonte oficial **Quicksand**.
  - Inseridos `<link rel="preconnect">` e `<link rel="stylesheet">` no `<head>` em `src/routes/__root.tsx` para carregamento imediato das fontes sem FOUT (Flash of Unstyled Text).
  - Variáveis `--font-display` e `--font-sans` mapeadas formalmente no bloco `@theme inline` do Tailwind CSS v4.
- **Validação Técnica**: 100% dos testes unitários (74/74) passando no Vitest, ESLint limpo e compilação de produção (`compile_applet`) verificada com sucesso.

## Atualização 2026-08-25 — Correção de Ordem de @import e Bundling no LightningCSS (TASK-050)

- **Ajuste de Diretivas CSS em `src/styles.css`**:
  - Removido o `@import url("https://...")` remoto dentro do arquivo CSS, já que as fontes do Google Fonts são carregadas de forma otimizada e assíncrona diretamente no `<head>` em `src/routes/__root.tsx` via `<link rel="stylesheet">`.
  - Isso eliminou o conflito de resolução no bundler LightningCSS (que tentava ler URLs remotas com `fs.readFileSync` no sistema de arquivos).
  - Mantida a ordem estrita no topo de `src/styles.css`: `@import "tailwindcss" source(none);`, `@import "tw-animate-css";` e `@source "../src";`.
- **Validação Completa**: Compilação de produção (`compile_applet`), linter (`eslint`) e suíte de testes (Vitest 74/74) 100% aprovados.

## Atualização 2026-08-28 — Revisão Completa de SEO Técnico e GEO (TASK-042)

- **Domínio Canônico**: `https://portfolio.goteamgoagency.com`
- **Módulo de Sitemap Dinâmico (`src/lib/sitemap.ts` e `src/server.ts`)**:
  - Implementada a rota do servidor `/sitemap.xml` para servir sitemap XML gerado em tempo real contendo a raiz (`/`) e todas as atletas públicas ativas (`/athlete/$slug`).
  - Cache HTTP headers otimizados (`max-age=3600, s-maxage=3600`).
- **Configuração de Rastreadores e Bots de IA (`public/robots.txt`)**:
  - Regras explícitas permitindo a indexação pública para motores de busca tradicionais (Googlebot, Bingbot, Twitterbot, facebookexternalhit) e motores generativos de IA (GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-Web, anthropic-ai, PerplexityBot, Google-Extended, Applebot-Extended).
  - Bloqueio estrito (`Disallow`) para rotas privadas (`/admin`, `/portal`, `/proposal/`, `/auth/`, `/api/`).
  - Declaração da URL canônica do Sitemap.
- **Metatags & Otimização GEO no Catálogo (`src/routes/index.tsx`)**:
  - Função `head()` gerando dynamic title, description, canonical link, Open Graph (1200x630) e Twitter cards.
  - Injeção de Structured Data JSON-LD com `SportsOrganization` e `ItemList`.
  - Melhoria da acessibilidade com atributos `alt` descritivos nos logos e nas capas de atletas.
- **Metatags & Otimização GEO no Perfil da Atleta (`src/routes/athlete.$slug.tsx`)**:
  - Função `head()` gerando dynamic title rico em palavras-chave, meta description contextual com esporte, país, posição e ano de formatura, Open Graph e Twitter cards.
  - Injeção de dados estruturados Schema.org JSON-LD `Person` (com afiliação institucional à Go Team Go Agency, modalidade e ocupação) e `BreadcrumbList`.
  - Breadcrumb visual acessível no topo da página e textos alternativos `alt` refinados nas fotos editoriais, galeria e histórico de conquistas.
- **Validação Técnica**: Compilação de produção (`compile_applet`) e tipagem TypeScript 100% verificadas com zero erros.

## Atualização 2026-08-31 — Posicionamento Global e Neutro da Agência (Recrutas Internacionais) (TASK-051)

- **Posicionamento Institucional Global Go Team Go Agency**:
  - Ajustado o foco e toda a copy pública para representar o escopo internacional real da agência (recrutamento de estudantes-atletas do mundo inteiro para ligas universitárias dos EUA - NCAA, NAIA, NJCAA).
  - Eliminados todos os vieses hardcoded de _"Brazilian athletes/recruits"_ na copy pública, metadados e fallbacks.
- **Catálogo Público & SEO (`src/routes/index.tsx`)**:
  - `pageTitle`: Atualizado para `"International Volleyball Recruits & College Athletes Catalog | Go Team Go Agency"`.
  - `pageDescription`: Atualizado para `"Explore [N] verified international volleyball recruits ready to compete and study in the USA. Verified academic credentials, game film, and athletic metrics."`.
  - Schema JSON-LD `SportsOrganization`: Atualizada descrição para `"Connecting elite student-athletes worldwide with university athletic programs and scholarships across the USA."`.
  - Schema JSON-LD `ItemList`: Atualizada descrição para `"Recruitment portfolio of international student-athletes seeking US college opportunities."`.
  - Fallback do subtítulo do Hero: Atualizado para `"Explore athlete profiles by position, watch game film, and discover top international recruits with verified academic and athletic credentials."`.
- **Dicionário de Textos (`src/i18n/messages.ts`)**:
  - Chave `"feed.subtitle"`: Atualizada para `"Hand-picked athletes from around the world, verified and presented to coaches nationwide."`.
- **Perfil Público do Atleta (`src/routes/athlete.$slug.tsx`)**:
  - Removido o fallback enviesado `|| "Brazilian"` que forçava qualquer atleta sem nacionalidade definida a aparecer como brasileiro no `<title>` e `<meta description>`.
  - Nacionalidade tornada neutra/opcional nos metadados e mantida a exibição com bandeira e nome do país quando cadastrada.
- **Metadados Globais & Admin (`src/routes/__root.tsx` e `src/routes/_authenticated/admin/visual.tsx`)**:
  - Meta description raiz atualizada para `"Catalog and tracking platform for international student-athletes pursuing collegiate athletic opportunities in the United States."`.
  - Placeholders e previews do painel administrativo atualizados para refletir o posicionamento internacional.
- **Auditoria de Filtros e Ordenação (`src/lib/catalog.ts`)**:
  - Confirmado que a normalização de países via `COUNTRY_PT_TO_EN` apenas trata variações de entrada sem aplicar nenhum peso, prioridade ou preferência sobre ordenação de atletas ou filtros.
- **Validação Técnica**: 74/74 testes unitários no Vitest aprovados, ESLint limpo e compilação de produção (`compile_applet`) com 100% de sucesso.

## Atualização 2026-09-02 — Implementação do Protocolo IndexNow (Bing / ChatGPT Indexing) (TASK-053)

- **Arquivo de Verificação Estático (`public/1675dcaaacd2469b9461671a29b307e0.txt`)**:
  - Criado arquivo de chave pública respondendo em `https://portfolio.goteamgoagency.com/1675dcaaacd2469b9461671a29b307e0.txt`.
- **Módulo IndexNow (`src/lib/indexnow.ts`)**:
  - Exporta constantes e funções: `INDEXNOW_KEY`, `INDEXNOW_HOST`, `INDEXNOW_KEY_LOCATION`, `INDEXNOW_ENDPOINT`, `sanitizeIndexNowUrls`, `sendIndexNowRequest` e `submitToIndexNow`.
  - Implementa Server Function TanStack Start (`submitToIndexNowServerFn`) para permitir disparo transparente a partir do navegador sem problemas de CORS.
  - Arquitetura 100% resiliente: `try/catch` interno que captura exceções e loga advertências sem nunca interromper fluxos chamadores ou interfaces.
- **Disparos Automáticos em Pontos de Mutação**:
  - `src/routes/_authenticated/admin/athletes/$id.tsx`: Salvar atleta (`save()`) e restaurar atleta (`archive()`) disparam `submitToIndexNow([athleteUrl])` caso o atleta seja público (`is_public === true` e sem `deleted_at`).
  - `src/routes/_authenticated/admin/athletes/index.tsx`: Criação de novo atleta já público dispara `submitToIndexNow`.
  - `src/routes/_authenticated/admin/visual.tsx`: Alteração de configurações visuais (logo, hero, background, textos do catálogo) e reordenação de categorias disparam `submitToIndexNow([homeUrl])`.
- **Script de Submissão em Massa (`scripts/indexnow-bulk.ts`)**:
  - Script totalmente desacoplado e standalone, sem dependências de `src/lib/indexnow.ts` ou do runtime do TanStack Start (`@tanstack/react-start`).
  - Executável diretamente via `npx tsx scripts/indexnow-bulk.ts` em qualquer ambiente Node.js / GitHub Codespaces ou via `bun scripts/indexnow-bulk.ts`.
  - Contém constantes locais (`INDEXNOW_KEY`, `HOST`, `KEY_LOCATION`, `INDEXNOW_ENDPOINT`), função HTTP autônoma via `fetch` nativo, consome o `sitemap.xml` dinâmico público, extrai e deduplica todas as tags `<loc>` e despacha um único POST em lote para a API IndexNow.
  - Testado contra o endpoint real com envio de 11 URLs e confirmação de sucesso com retorno HTTP 200/202.
- **Testes Unitários (`src/lib/indexnow.test.ts`)**:
  - Testes com Vitest cobrindo payload, sanitização, deduplicação, tratamento de falhas de rede e respostas HTTP anômalas.
- **Validação Técnica**: 80/80 testes unitários no Vitest aprovados, ESLint limpo e compilação de produção (`compile_applet`) com 100% de sucesso.

## Atualização 2026-09-02 — Padronização dos CTAs de Contato para E-mail Contextual (TASK-056)

- **Centralização do Canal de E-mail (`src/lib/contact.ts`)**:
  - Definida constante `AGENCY_CONTACT_EMAIL` com suporte a override via `import.meta.env.VITE_AGENCY_CONTACT_EMAIL` e fallback oficial para `contact@goteamgoagency.com`.
  - Criada função segura `buildMailtoUrl({ to, subject, body })` aplicando sanitização estrita via `encodeURIComponent` sobre todos os parâmetros, garantindo suporte a acentuação, espaços e quebras de linha (`\n\n`).
  - Criada função contextual tipada `buildContactEmailUrl(context: ContactEmailContext)` cobrindo os contextos:
    - `hero`: Assunto `"I'm interested in working with Go Team Go"`.
    - `catalog`: Assunto `"Athlete recruitment inquiry"`.
    - `athlete`: Assunto dinâmico `"Interest in ${athleteName}"`, injetando URL do perfil e interesse em recrutamento.
    - `footer`: Assunto `"Contact through website"`.
    - `general`: Assunto genérico com nota customizável.
- **Pontos de Contato Atualizados**:
  - **Página Inicial (`src/routes/index.tsx`)**:
    - **Hero**: Adicionado botão de contato editorial _"Talk to our team"_ (`liquid-button`) disparando `mailto:` com o contexto `hero`.
    - **Final do Catálogo**: Botão _"Talk to Go Team Go"_ atualizado para e-mail com contexto `catalog` e ícone `Mail`.
    - **Rodapé (Footer)**: Adicionado link discreto _"Get in touch"_ com contexto `footer`.
  - **Perfil do Atleta (`src/routes/athlete.$slug.tsx`)**:
    - **Hero**: Botão _"Recruit Athlete"_ atualizado para `mailto:` contextual do atleta, com ícone `Mail`.
    - **Barra de Navegação Sticky**: Botão _"Recruit"_ com ícone `Mail`, mantendo a rolagem fluida até a âncora `#recruit-cta`.
    - **Seção `#recruit-cta`**: Texto ajustado para contato via e-mail e botão atualizado para _"Recruit [FirstName] via Email"_.
    - **Rodapé (Footer)**: Adicionado link discreto _"Get in touch"_ com contexto `footer`.
  - **Visualizador Global de Highlights (`src/components/global-highlights-viewer.tsx`)**:
    - Botão lateral de recrutamento no player de reels atualizado para disparar `mailto:` contextual com o nome e slug do atleta ativo, com ícone `Mail`.
- **Exceção Mandatória Respeitada**:
  - O botão flutuante oficial do WhatsApp (`src/components/whatsapp-fab.tsx`) permaneceu **100% inalterado**, preservando a opção direta de WhatsApp em toda a aplicação.
- **Correção de Tipagem Pré-existente (`src/lib/catalog.test.ts`)**:
  - Corrigido mock de posição na linha 101 (`name_en: ""` em vez de `null`), garantindo conformidade estrita com os tipos TypeScript (`PositionRow`).
- **Testes Unitários & Validação**:
  - Criado arquivo de testes `src/lib/contact.test.ts` cobrindo todos os cenários de `buildMailtoUrl`, `buildContactEmailUrl`, sanitização, acentuação e preservação do helper de WhatsApp (89/89 testes aprovados).
  - Execução de `bun run typecheck`, `bun run lint` e `bun run test` 100% aprovada.

## Atualização 2026-09-02 — Feature "Recruit Email" para Coaches Universitários (TASK-058)

- **Migration SQL (`db/migrations/0016_coaches_and_recruit_emails.sql`)**:
  - Tabela `coaches`: `id` (UUID), `name` (TEXT), `email` (TEXT UNIQUE NOT NULL), `institution` (TEXT NOT NULL), `created_at`, `updated_at`. Índices em `email` e `institution`. RLS habilitado restrito a usuários com papel `agency_admin`.
  - Tabela `recruit_email_logs`: `id` (UUID), `coach_id` (FK `coaches`), `athlete_id` (FK `athletes`), `sender_email` (TEXT), `status` (`sent` / `failed`), `error_message` (TEXT), `resend_email_id` (TEXT), `created_at`. Índices em `athlete_id`, `coach_id` e `created_at`.
  - Coluna `highlight_note TEXT` adicionada em `athlete_profiles` para customização da frase de gancho no teaser do atleta.
- **Tipagem TypeScript (`src/types/db.ts`)**:
  - Interfaces `Coach` e `RecruitEmailLog` adicionadas e exportadas.
  - Interface `AthleteProfile` atualizada com o campo opcional `highlight_note?: string | null`.
- **Módulo de E-mail Teaser Dark/Emerald Premium (`src/lib/email/recruit-email-template.ts`)**:
  - Renderiza HTML em linha com layout responsivo mobile-first, paleta esmeralda/dourado (`#061b13`, `#30b884`, `#eab308`), retrato 4:5 do atleta, badges de posição/país, bloco biométrico (altura imperial ft/in, peso lbs, data de nascimento, classe/ano), bloco acadêmico (GPA formatado e curso de interesse), frase de destaque configurada (`highlight_note`), CTA exclusivo em formato de botão pílula verde direcionando ao perfil público oficial e rodapé da agência Go Team Go.
  - Helper `generateRecruitEmailSubject` com formato: `Recruiting Prospect: {Name} ({Position}, Class of {Year}) - Go Team Go`.
- **Backend & Batch Sending (`src/lib/email/recruit-email.server.ts`)**:
  - Envio em massa utilizando `resend.batch.send` (em lotes de até 100 destinatários por chamada para respeitar limites da API do Resend).
  - Remetente fixado em `contact@goteamgoagency.com` com display name `Go Team Go Agency`.
  - Persistência detalhada de logs de envio na tabela `recruit_email_logs` para rastreabilidade completa.
- **Server Function Segura (`src/lib/email/recruit-email.functions.ts`)**:
  - Server Function TanStack Start `sendRecruitEmailServerFn` com validação estrita de autenticação via `requireAgency(event)`, impedindo disparos não autorizados.
- **Gestão de Coaches no Admin (`src/routes/_authenticated/admin/coaches.tsx`)**:
  - Tabela com busca em tempo real por nome, e-mail ou instituição.
  - Ações manuais de criação, edição e exclusão com diálogo de confirmação.
  - Importador inteligente de planilhas CSV e XLSX:
    - Drag-and-drop e seleção manual de arquivos.
    - Parser com suporte flexível a delimitadores (, ; tab) e colunas comuns em inglês/português (name/nome, email/e-mail, institution/universidade/college/escola).
    - Validação de e-mails válidos com regex, deduplicação em memória contra a base existente e entre as linhas do próprio arquivo.
    - Card de resumo com contadores de registros válidos e descartados antes da confirmação.
    - Modal de prévia com tabela paginada dos coaches prontos para inserção.
- **Disparo do E-mail Teaser pelo Perfil do Atleta (`src/components/send-recruit-email-dialog.tsx` & `src/routes/_authenticated/admin/athletes/$id.tsx`)**:
  - Botão _"Send to Coaches"_ em destaque no header administrativo do atleta.
  - Modal com pré-visualização WYSIWYG em tempo real do e-mail montado.
  - Seleção em massa com busca instantânea e checkboxes individuais ou de todos os coaches.
  - Indicador numérico dinâmico no botão de disparo: _"Send to X coaches"_.
  - Diálogo de confirmação de segurança com contagem final antes do envio.
  - Campo "Recruit Email Hook Line" adicionado na aba de edição do atleta para personalização do gancho editorial antes do disparo.
- **Navegação (`src/components/app-shell.tsx`)**:
  - Item "Coaches" com ícone de graduação (`GraduationCap`) adicionado na barra lateral da agência.
- **Validação Técnica**:
  - Linting executado com zero erros.
  - Compilação de produção TanStack Start / Vite validada com sucesso (`compile_applet`).

## Atualização 2026-09-03 — Correção e Blindagem da Página de Coaches e Modal "Send to Coaches" (TASK-059)

- **Correção de Invocação de Constantes CSS (`TypeError: buttonClass is not a function`)**:
  - `src/components/admin-ui.tsx` exporta `buttonClass` e `secondaryButtonClass` como constantes de string Tailwind (`rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold...`), não como funções.
  - Substituídas todas as ocorrências de `buttonClass("secondary")` e `buttonClass("primary")` por `secondaryButtonClass` e `buttonClass` em:
    - `src/routes/_authenticated/admin/coaches.tsx` (botões do topo, cards de estado vazio, modais de criação/edição, importador de planilhas e exclusão).
    - `src/components/send-recruit-email-dialog.tsx` (botões de Cancelar e Confirmar no rodapé e no modal de confirmação pré-disparo).
- **Adequação de Componentes Admin UI (`Panel` e `EmptyState`)**:
  - `src/routes/_authenticated/admin/coaches.tsx`:
    - Adicionada a prop obrigatória `title="Coaches Directory"` ao componente `<Panel>`.
    - Substituído o uso incorreto de props `title`/`description` em `<EmptyState>` pela renderização do texto diretamente como `children`, em estrita conformidade com a interface de `EmptyState` em `admin-ui.tsx`.
- **Experiência de Usuário e Resiliência em Base Vazia (Empty State)**:
  - `src/components/send-recruit-email-dialog.tsx`:
    - Implementado Empty State amigável e explicativo para quando não há coaches cadastrados no banco de dados, com badge esmeralda e botão de ação direta que abre o diretório de coaches (`/admin/coaches`) para importação da planilha.
    - Adicionado botão auxiliar _"Manage Coaches"_ com ícone `ExternalLink` no cabeçalho do diálogo modal.
    - Tratamento de erro resiliente com banner vermelho e botão de _"Retry"_ caso a chamada Supabase sofra falhas de conexão.
- **Blindagem do Iframe de Prévia de E-mail**:
  - Removido o atributo `sandbox="allow-same-origin"` do iframe em `src/components/send-recruit-email-dialog.tsx`, substituindo por `sandbox="allow-popups allow-popups-to-escape-sandbox"` para evitar bloqueios de segurança de navegadores em contextos aninhados (como o preview do container e iframes pais).
- **Blindagem de Template de E-mail (`src/lib/email/recruit-email-template.ts`)**:
  - Tratamento com fallback seguro para `athleteName`, `athleteSlug` e cálculo da inicial, prevenindo quebras em atletas com propriedades parciais ou em preenchimento.
- **Validação Automatizada & Qualidade de Código**:
  - Suíte completa de testes unitários Vitest executada com 100% de sucesso (14 arquivos, 89 testes aprovados).
  - Verificação de linter (`npm run lint` / ESLint) sem erros.
  - Compilação de produção TanStack Start / Vite executada e validada com sucesso via `compile_applet`.

## Atualização 2026-09-03 — Redução Drástica de Custo de Egress (Storage + PostgREST) (TASK-060)

- **Diagnóstico & Contexto**:
  - A aplicação enfrentou consumo acentuado de egress (~37 GB/dia em pico de ~1.000 coaches). A distribuição era ~66,1% Storage Egress e ~33,8% PostgREST Egress.
  - As imagens eram baixadas em resolução original pesada (2MB a 5MB por foto de câmera) sem headers de cache `max-age` em objetos do Supabase Storage.
  - O catálogo público e perfil do atleta executavam `select("*")` e queries irrestritas de likes, multiplicando o tráfego de dados por visitante.
- **Utilitário de Transformação e Redimensionamento de Imagens (`src/lib/image-transform.ts`)**:
  - Utiliza o endpoint oficial de Image Transformation do Supabase (`/storage/v1/render/image/public/<bucket>/<path>?width=W&height=H&resize=cover&quality=Q`).
  - Funções de renderização otimizadas com presets responsivos e WebP automático:
    - `getAthleteCardImage(url)`: 600x750px, quality 80 (redução de ~3.5MB para ~35KB, ~99% de economia por card).
    - `getAthleteHeroImage(url)`: 800x1000px, quality 85 (redução de ~4MB para ~70KB).
    - `getAthleteStoryAvatar(url)`: 160x160px, quality 80.
    - `getAthleteGalleryImage(url)`: 800x600px, quality 80.
    - `getAgencyLogoImage(url)`: 300x100px, resize contain.
    - `getCatalogHeroBackgroundImage(url)`: 1920x800px, quality 80.
  - Fallback automático e seguro para imagens não-Supabase (Unsplash, URLs locais, SVGs) sem quebrar o layout.
  - Suíte completa de testes de unidade em `src/lib/image-transform.test.ts` (9 testes, 100% aprovados).
- **Uploads com Cache-Control Long-Term (`max-age=31536000, immutable`)**:
  - Atualizados todos os pontos de upload no painel admin com `cacheControl: "31536000"`:
    - `src/routes/_authenticated/admin/athletes/$id.tsx` (foto do atleta, capa e mídias da galeria).
    - `src/routes/_authenticated/admin/visual.tsx` (logotipo da agência e imagem de fundo do hero).
    - `src/routes/_authenticated/admin/settings.tsx` (logotipo da agência).
    - `src/routes/_authenticated/admin/proposals/$id.tsx` (anexos e ativos de propostas).
  - A estratégia combina cache imutável de 1 ano com cache-busting natural via UUID nos nomes de arquivos gerados.
- **Migração SQL & Script Retroativo para Objetos Existentes**:
  - Migration `db/migrations/0017_storage_cache_control_and_update_policy.sql` criada para atualizar o metadata de objetos existentes em `storage.objects` e garantir política RLS de UPDATE para administradores.
  - Script autônomo `scripts/update-storage-cache-control.ts` acionável via `npm run storage:cache-control` (`vite-node`) para varrer e re-aplicar os metadados nos buckets públicos (`athlete-media`, `proposal-assets`, `stage-celebrations`).
- **Cache de CDN/Edge em Rotas Públicas (`src/server.ts`)**:
  - Middleware `applyCacheControlHeaders` implementado no entrypoint HTTP do servidor:
    - Rota do catálogo (`/`): `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=86400` + headers compatíveis com Vercel Edge Cache (`cdn-cache-control`, `vercel-cdn-cache-control`).
    - Rota do perfil do atleta (`/athlete/:slug`): `public, max-age=120, s-maxage=900, stale-while-revalidate=86400`.
    - Chamadas públicas de server function (`listPublicAthletes`, `getPublicAthlete`): `public, max-age=60, s-maxage=300, stale-while-revalidate=86400`.
    - Rotas privadas (`/admin`, `/portal`, `/auth`) e requisições autenticadas blindadas estritamente com `private, no-cache, no-store, must-revalidate`.
- **Otimização Drástica de Payload PostgREST (`src/lib/athletes.functions.ts`)**:
  - Removido qualquer `select("*")` nas consultas públicas.
  - Criadas constantes de projeção mínima com apenas as colunas consumidas pelas telas:
    - `AGENCY_VISUAL_PUBLIC_SELECT`: apenas campos textuais públicos e URLs de logotipo/hero.
    - `PUBLIC_PROFILE_SELECT`: apenas os campos exibidos na Fact Sheet e Bio do atleta.
    - `PUBLIC_MEDIA_SELECT`: apenas metadados públicos e URLs de mídia.
    - `PUBLIC_ACHIEVEMENTS_SELECT`: apenas títulos, datas e imagens de conquistas.
    - `PUBLIC_VIDEOS_SELECT`: apenas URLs do YouTube, kind e títulos.
  - Otimizada a consulta de contagem de likes em `listPublicAthletes`: em vez de carregar a tabela inteira por ID de atleta, filtra estritamente por `video_id IN (allVideoIds)`, economizando tráfego de dados.
- **Componentes do Catálogo e Perfil Conectados**:
  - `src/components/athlete-video-card-media.tsx`: card do atleta utiliza `getAthleteCardImage`.
  - `src/components/home-highlights-story-bar.tsx` & `src/components/global-highlights-viewer.tsx`: stories utilizam `getAthleteStoryAvatar`.
  - `src/routes/index.tsx`: logo do header, imagem do hero do catálogo e logo do rodapé otimizados.
  - `src/routes/athlete.$slug.tsx`: logo, hero do atleta, fotos de conquistas, galeria de fotos, próximo atleta e tag `og:image` otimizados.
- **Validação de Qualidade & Testes**:
  - Testes unitários Vitest: 15 arquivos, 98 testes passaram com 100% de sucesso.
  - Verificação de tipos TypeScript (`npm run typecheck`): 0 erros.
  - Linter ESLint (`npm run lint`): 0 erros.
  - Compilação de produção (`compile_applet`): Build concluído com sucesso.

### 4.14 Telemetria, Analytics e Rastreamento de Tráfego

- **Google Analytics 4 (GA4)**: `G-4D6DTG650F` injetado no `<head>` de `RootShell` em `src/routes/__root.tsx`.
- **Microsoft Clarity**: ID `y7zkn8qxno` injetado no `<head>` de `RootShell` em `src/routes/__root.tsx`.
- **Meta Pixel (Facebook Pixel)**:
  - Pixel ID: `1115203944400884`.
  - Injetado no `<head>` de `RootShell` em `src/routes/__root.tsx` com fallback `<noscript>` e inicialização com `fbq('track', 'PageView')`.
  - Componente de rastreamento client-side `MetaPixelTracker` integrado dentro de `<AppProviders>` em `RootComponent`, monitorando transições de rota via `useRouterState` para disparar eventos `PageView` em navegações SPA sem duplicidade na montagem inicial.

## Atualização 2026-09-09 — Migração do Mailer para Aba Dedicada + Cadastro Estruturado de Universidades (TASK-062)

- **Evolução de Banco de Dados (`db/migrations/0018_universities_and_mailer.sql`)**:
  - Tabela `universities` criada:
    - Campos institucionais: `id UUID`, `name TEXT NOT NULL`, `city TEXT NOT NULL`, `state TEXT NOT NULL (2 chars)`, `league TEXT`, `source_url TEXT`, `is_hbcu BOOLEAN DEFAULT FALSE`, `budget_level TEXT`, `toefl_level TEXT`.
    - Sub-registros em `JSONB`: `coaches JSONB DEFAULT '[]'::jsonb` (lista de treinadores com `id`, `first_name`, `last_name`, `email`, `role`) e `history JSONB DEFAULT '[]'::jsonb` (timeline de acontecimentos e anotações com `id`, `date`, `event`).
    - Índices criados para alta performance em buscas textuais e filtros: `name_trgm_idx`, `state_idx`, `league_idx`, `is_hbcu_idx`, `budget_level_idx`, `toefl_level_idx`.
    - RLS ativado com permissão integral (`ALL`) para administradores da agência (`agency_admin`).
  - Tabela `email_suppressions` criada:
    - Armazenamento de contatos que solicitaram descadastro (opt-out / unsubscribe): `id UUID`, `email TEXT NOT NULL`, `reason TEXT`, `source TEXT DEFAULT 'unsubscribe_link'`, `created_at TIMESTAMPTZ`.
    - Índice exclusivo `email_suppressions_email_lower_idx` em `lower(trim(email))` garantindo unicidade case-insensitive.
    - Políticas RLS: leitura e gestão restritas a administradores; inserção anônima permitida para registro legítimo de descadastro via link público.
  - Tabela `recruit_email_logs` evoluída:
    - Desacoplamento da antiga foreign key com `coaches` (permitindo manter histórico perpétuo mesmo após exclusões ou edições de contatos).
    - Adicionadas as colunas `email_type TEXT DEFAULT 'athlete_teaser'`, `recipient_name TEXT`, `recipient_email TEXT`, `university_name TEXT`.
    - Status expandido para suportar `'sent'`, `'failed'`, `'suppressed'`.
- **Novos Tipos TypeScript (`src/types/db.ts`)**:
  - Tipos criados: `University`, `UniversityCoach`, `UniversityHistoryEntry`, `UniversityLeague`, `UniversityBudgetLevel`, `UniversityToeflLevel`, `EmailSuppression`.
  - Interface `RecruitEmailLog` atualizada com novas colunas e status `suppressed`.
- **Templates de E-mail de Recrutamento (`src/lib/email/`)**:
  - `recruit-email-template.ts`: Adicionado parâmetro `recipientEmail` com injeção automática de URL de descadastro (`CANONICAL_BASE_URL/unsubscribe?email=...`) em conformidade com CAN-SPAM e boas práticas de entregabilidade.
  - `recruit-email-catalog-template.ts`: Novo template institucional moderno (Dark/Emerald Theme) com apresentação do elenco geral de atletas, métricas de verificação da agência e botão CTA apontando para a home pública do portfólio.
- **Camada de Backend e Servidor (`src/lib/email/recruit-email.server.ts` & `recruit-email.functions.ts`)**:
  - Função `sendMailerEmails`:
    - Processamento de três modos de envio: `single_athlete`, `multi_athlete`, `catalog`.
    - Pré-filtragem automática contra a tabela `email_suppressions`, garantindo que contatos que deram opt-out nunca recebam novos e-mails.
    - Envio em lote (chunking de 100 itens) para a API do Resend.
    - Registro detalhado em `recruit_email_logs` com status correspondente (`sent`, `failed`, `suppressed`).
  - Server functions expostas: `sendMailerServerFn`, `getSuppressedEmailsServerFn`, `unsubscribeServerFn`, `getMailerHistoryServerFn`.
- **Rota Pública de Descadastro (`src/routes/unsubscribe.tsx`)**:
  - Interface amigável e segura para coaches universitários optarem por não receber mais comunicações da agência.
  - Pré-preenchimento automático via search param `?email=...`.
  - Seleção opcional de motivos de descadastro (não recruta internacionais, vaga preenchida, não é o coach responsável, etc.).
- **Gestão de Universidades e Coaches (`src/routes/_authenticated/admin/universities.tsx`)**:
  - Painel com filtros multifacetados por Estado (50 estados americanos + DC), Liga (NJCAA D1/D2, NCAA D1/D2, NAIA), HBCU, Budget Level (`0–1000`, `1000–5000`, `5000–10000`, `10000+`) e TOEFL Level (`0`, `0–61`, `61+`).
  - Modal de cadastro e edição completo com gerenciamento inline de sub-coaches e histórico de eventos.
  - Importador inteligente de planilhas (`.xlsx` e `.csv`) com download de template pré-formatado, validação em linha e agrupamento automático de coaches sob a mesma universidade.
- **Painel Central do Mailer (`src/routes/_authenticated/admin/mailer.tsx`)**:
  - Seletor dos 3 modos de envio: Atleta Específico, Multi-atleta (em lote) e Catálogo Institucional.
  - Seletor de destinatários com filtros avançados e indicação de contatos com opt-out (suppressed).
  - Pré-visualização WYSIWYG responsiva em tempo real com iframe seguro (`srcDoc`).
  - Modal de confirmação com cálculo antecipado do volume total de disparos e contatos pulados.
  - Aba de Histórico com auditoria de envios, status de entrega e motivos de falha/supressão.
- **Navegação & Perfil do Atleta**:
  - `src/components/app-shell.tsx`: Links de "Universidades" (`/admin/universities`) e "Mailer" (`/admin/mailer`) adicionados ao menu lateral.
  - `src/routes/_authenticated/admin/athletes/$id.tsx`: Botão antigo de modal substituído por link contextual para o novo Mailer (`/admin/mailer?mode=single&athleteId=...`).

## Atualização 2026-09-09 — Hotfix RLS, Redesign de E-mails com Paleta Oficial, Filtros Avançados e Otimização de Importação (TASK-063)

- **Hotfix de RLS Migration (`db/migrations/0019_fix_universities_rls_role_reference.sql`)**:
  - Resolvido erro de execução `column profiles.role does not exist` na migration 0018.
  - Criada migration 0019 redefinindo todas as RLS policies das tabelas `universities` e `email_suppressions` para utilizar a função canônica do projeto `public.is_agency_admin()`.
  - Migration `0018_universities_and_mailer.sql` também saneada preventivamente.
- **Redesign dos Templates de E-mail com Identidade Visual Oficial**:
  - `src/lib/email/recruit-email-template.ts` e `src/lib/email/recruit-email-catalog-template.ts` totalmente convertidos para a paleta oficial Go Team Go:
    - Fundo envelope: `#f8faf5`.
    - Container principal: `#ffffff` com borda `#e3e9dc` e sombra sutil.
    - Tipografia principal: `#032812` (títulos e textos) e `#4b6353` (secundários/muted).
    - Badges e destaques institucionais: fundo `#084323`, texto `#ffffff`.
    - Botão de CTA e destaques de ação: `#f69e00` com texto `#032812` de alto contraste e legibilidade.
    - Rodapé institucional: `#f0f4ec` com links em `#084323` e divisor `#e3e9dc`.
    - Removidas 100% das cores do tema Dark legado (`#0b0b0c`, `#059669`, etc.).
- **Filtros Avançados de Destinatários no Mailer (`src/routes/_authenticated/admin/mailer.tsx`)**:
  - `src/lib/universities-constants.ts`: adicionado mapeamento `REGION_BY_STATE` contemplando todos os 50 estados americanos + DC divididos em 4 regiões (`Northeast`, `Midwest`, `South`, `West`).
  - Painel do Mailer atualizado com novos dropdowns para Região dos EUA, Orçamento (Budget Level) e TOEFL/Duolingo Level, combinados com lógica estrita `AND` com os filtros existentes (Estado, Liga, HBCU).
- **Otimização de Performance na Importação em Massa (`src/routes/_authenticated/admin/universities.tsx`)**:
  - `handleConfirmImport` reescrito eliminando consultas individuais N+1 ao banco de dados.
  - Carregamento prévio único de todas as universidades em um `Map` chaveado por `name_state` para buscas O(1).
  - Separação das listas `toUpdate` e `toInsert` e execução paralela em lotes de 25 registros via `Promise.all`.
- **Validação de Qualidade**:
  - Testes unitários Vitest: 15 arquivos, 98 testes aprovados com 100% de sucesso.
  - ESLint: 0 erros.
  - Compilação de produção: Concluída com sucesso.

## Atualização 2026-09-09 — Estabilização e Tipagem das Rotas Administrativas de Universidades e Mailer (TASK-064)

- **Correção dos Wrappers de Rota e Layout**:
  - `src/routes/_authenticated/admin/mailer.tsx` e `src/routes/_authenticated/admin/universities.tsx` atualizados para usar `<ProtectedPage role="agency_admin">` (prop `role` canônica) e `<AppShell role="agency_admin" title="...">`.
  - Substituídos os componentes de painel incompatíveis por containers utilitários estilizados `glass-panel` com bordas e backgrounds alinhados ao design system.
- **Tipagem Segura de Logs de Mailer (`src/lib/email/recruit-email.server.ts`)**:
  - Tipagem refinada para inserções de auditoria no Supabase (`recruit_email_logs`) aceitando `athlete_id: null` para campanhas institucionais de catálogo geral sem recorrer a `any`.
- **Validação de Qualidade**:
  - ESLint: 0 erros.
  - Compilação de produção (`compile_applet`): Build concluído com 100% de sucesso.

## Atualização 2026-09-15 — Correção do Select de Agency Visual Settings, Logging de Erros e Migração 0019 (TASK-066)

- **Causa Raiz & Resolução do Bug de Identidade Visual (Logo / Hero / Favicon)**:
  - Na migração `0013_full_english_pivot_and_course_of_interest.sql`, as colunas `hero_title_pt`, `hero_subtitle_pt` e `catalog_heading_pt` foram removidas da tabela `agency_visual_settings`.
  - A constante `AGENCY_VISUAL_PUBLIC_SELECT` em `src/lib/athletes.functions.ts` ainda referenciava essas colunas inexistentes, fazendo com que o Supabase/PostgREST rejeitasse a consulta pública inteira com erro `400 / 42703 (undefined_column)`.
  - A constante foi corrigida para selecionar estritamente as colunas válidas: `agency_id, hero_title_en, hero_subtitle_en, catalog_heading_en, logo_url, hero_background_url`.
- **Tratamento e Logging de Erros**:
  - Adicionado logging explícito via `console.error` em `getAgencyVisual`, `listPublicAthletes` e `getPublicAthlete` ao consultar `agency_visual_settings`, prevenindo que falhas silenciosas futuras ocultem erros de schema ou permissão.
- **Saneamento de Tipagem e Componentes**:
  - `src/types/db.ts`: Removidos os campos obsoletos `hero_title_pt`, `hero_subtitle_pt` e `catalog_heading_pt` da interface `AgencyVisualSettings`.
  - `src/routes/index.tsx`: Removidas as leituras residuais de fallbacks `_pt` da Home.
- **Testes Unitários de Projeção**:
  - `src/lib/athletes.functions.test.ts`: Adicionada suite de testes para `AGENCY_VISUAL_PUBLIC_SELECT` assegurando que colunas `_pt` jamais sejam selecionadas e que todos os campos visuais em inglês e branding estejam presentes.
- **Histórico de Migrations (`db/migrations/0019_fix_universities_rls_role_reference.sql`)**:
  - Criada a migração 0019 formalizando o hotfix de RLS para `universities` e `email_suppressions` com `public.is_agency_admin()`, sincronizando o repositório com o diário de bordo.
- **Validação de Qualidade**:
  - Vitest: 15 arquivos de testes, 100 testes unitários passando (100% de sucesso).
  - ESLint: 0 erros.
  - Compilação de produção (`compile_applet`): Build concluído com sucesso.

## Atualização 2026-09-16 — Migração Completa de E-mail de Resend para Amazon SES (TASK-067)

- **Substituição de Dependências e Pacotes**:
  - Pacote `resend` completamente desinstalado do projeto.
  - Adicionado SDK oficial AWS `@aws-sdk/client-sesv2` para envio e gerenciamento de e-mails via Amazon SES API v2.
- **Variáveis de Ambiente (`.env.example` e Runtime)**:
  - Substituída a variável legada `RESEND_API_KEY` por:
    - `AWS_ACCESS_KEY_ID`: ID da chave de acesso IAM.
    - `AWS_SECRET_ACCESS_KEY`: Chave secreta de acesso IAM.
    - `AWS_REGION`: Região AWS (ex: `us-east-1` ou `sa-east-1`).
    - `SES_CONFIGURATION_SET`: Nome do Configuration Set associado ao tópico SNS para rastreamento de eventos.
    - `SES_MAX_SEND_RATE`: Limite de taxa de envio da conta SES (default: `10` envios/segundo).
  - `EMAIL_FROM` mantido com suporte a display name e fallback seguro (`Go Team Go <contact@goteamgoagency.com>`).
- **Singleton e Configuração do SES (`src/lib/email/ses-client.server.ts`)**:
  - Utilitários `getSesConfig()`, `getSesClient()` e `resetSesClientCache()`.
  - Lazy initialization prevenindo quebras de startup quando credenciais não estiverem provisionadas no ambiente local.
- **E-mails Transacionais e Janela de Envio (`src/lib/email/email.server.ts`)**:
  - Migrado método `sendEmail` para `SendEmailCommand`.
  - Envio imediato em horário comercial com fallback de agendamento na fila (`email_log` com `status: "scheduled"`).
  - Função `processScheduledEmails()` para envio em lote de e-mails agendados que atingiram a janela de envio.
  - Server function TanStack Start `processScheduledEmailsServerFn` em `src/lib/email/email.functions.ts`.
- **Mailer de Recrutamento em Massa para Coaches (`src/lib/email/recruit-email.server.ts`)**:
  - Substituído disparo batch do Resend por loop assíncrono controlado com rate limiting (throttling parametrizável via `SES_MAX_SEND_RATE`).
  - Suporte completo a `ConfigurationSetName` para direcionar eventos de envio ao tópico SNS.
  - Inserções individuais de auditoria na tabela `recruit_email_logs` com status `sent` ou `failed` e detalhamento de erros.
  - Respeito estrito à tabela `email_suppressions` impedindo envio a contatos descadastrados ou com histórico de bounce/queixa.
- **Processamento de Webhooks SNS de Bounce e Complaint (`src/lib/email/ses-webhook.server.ts` & `src/server.ts`)**:
  - Criado processador `processSnsWebhook` que:
    - Auto-confirma inscrições de tópicos SNS (`SubscriptionConfirmation`) validando domínios oficiais da AWS (`*.amazonaws.com`).
    - Processa notificações SES (`Bounce` permanente e `Complaint`), inserindo automaticamente os e-mails na tabela `email_suppressions` com os motivos `ses_bounce_permanent` e `ses_complaint`.
  - Exposta rota `POST /api/webhooks/ses` no `src/server.ts`.
  - Exposta rota `POST|GET /api/cron/process-scheduled-emails` no `src/server.ts`.
- **Testes Automatizados (`src/lib/email/ses-email.test.ts`)**:
  - Cobertura de configuração, detecção de credenciais, confirmação de assinatura SNS com validação de domínio seguro e processamento de suppressions por Bounce/Complaint.
- **Validação de Qualidade**:
  - Vitest: 16 arquivos de testes, 106 testes unitários aprovados (100% de sucesso).
  - ESLint: 0 erros.
  - Compilação de produção (`compile_applet`): Build concluído com sucesso.

## Atualização 2026-09-17 — Mailer: Unificação Multi-Atleta, Filtros Avançados, Sinais de Interesse e Descadastro em 2 Níveis (TASK-070)

- **Unificação de Disparo Multi-Atleta (`src/lib/email/recruit-email-template.ts` & `src/lib/email/recruit-email.server.ts`)**:
  - Implementada função `renderMultiAthleteRecruitEmail` que compõe um único e-mail elegante com design mobile-first e Quiet Luxury contendo todos os cards das atletas selecionadas empilhados (com foto, nome, posição, biometria, ano de formatura, acadêmico, highlight quote e botão CTA individual de acesso ao perfil).
  - Atualizado `sendRecruitEmailsServer` para agrupar envios por destinatário no modo `multi_athlete`, disparando 1 único e-mail com Configuration Set do SES, gerando 1 log consolidado na auditoria e incrementando a contagem de e-mails enviados.
  - Atualizado o modal de pré-visualização e disparo em `src/routes/_authenticated/admin/mailer.tsx` para refletir visualmente o e-mail unificado empilhado.

- **Filtros Avançados de Destinatários no Mailer (`src/routes/_authenticated/admin/mailer.tsx`)**:
  - Adicionados filtros por:
    - **HBCU**: Todas as Instituições vs. Apenas HBCU vs. Não-HBCU.
    - **Budget Level**: Seleção multi-nível (Ex: High, Mid, Low).
    - **TOEFL Level**: Seleção multi-nível (Ex: None, Basic, Moderate, High).
  - Combinados com os filtros existentes (Gênero/Divisão, Liga, Estado) via lógica restritiva `AND`.

- **Sinais de Interesse de Coaches (`coach_interest_signals`) & Desinteresse Inteligente**:
  - **Migration `0020_interest_signals_and_suppression_levels.sql`**:
    - Criação da tabela `coach_interest_signals` com `email`, `coach_id`, `athlete_id`, `position`, `reason`, `notes`, `expires_at` (padrão de 6 meses via `now() + interval '6 months'`) e `created_at`.
    - Atualização da tabela `email_suppressions` com `suppression_type` (`temporary_6m` ou `permanent`) e `expires_at`.
  - **Nova Rota Pública de Feedback (`src/routes/feedback.tsx`)**:
    - Tela pública para o coach registrar desinteresse com 4 opções padronizadas:
      1. *Roster is full for this recruiting class*
      2. *Not currently recruiting for this position*
      3. *Need players for other specific positions*
      4. *Not recruiting international student-athletes*
    - Suporte a campo opcional para posições abertas e observações, com expiração automática em 6 meses.
  - **Badges Visuais de Alerta de Conflito no Mailer (`src/routes/_authenticated/admin/mailer.tsx`)**:
    - Carregamento de sinais ativos via `getActiveInterestSignalsServerFn`.
    - Exibição de alertas visuais (badges amarelos/âmbar) na listagem de destinatários quando houver colisão de posição ou roster lotado recente para aquele coach/instituição.

- **Descadastro em 2 Níveis (`src/routes/unsubscribe.tsx`)**:
  - Reformulada tela de unsubscribe com duas opções claras e transparentes:
    1. **Pausar por 6 meses (`temporary_6m`)**: Pausa temporária recomendada para ciclos de temporada.
    2. **Descadastro Permanente (`permanent`)**: Supressão perpétua de comunicações de recrutamento.
  - Verificação de supressão ativa em `getSuppressedEmailSet` respeitando a data de expiração (`expires_at > now()`).

- **Testes Automatizados & Qualidade**:
  - Criado `src/lib/email/recruit-email-multi.test.ts` com cobertura completa de renderização de e-mail multi-atleta empilhado, rodapé com links contextualizados e parâmetros seguros.
  - Vitest: 17 arquivos de testes, 109 testes unitários aprovados (100% de sucesso).
  - ESLint: 0 erros.
  - Compilação de produção (`compile_applet`): Build concluído com sucesso.

## Atualização 2026-09-18 — Correção Consolidada: UI Pattern + Brand Assets (TASK-071)

- **Refatoração Visual das Rotas Públicas (`src/routes/feedback.tsx` e `src/routes/unsubscribe.tsx`)**:
  - **Identidade Visual e Design Tokens**: Eliminada a paleta hardcoded escura desalinhada (`#0b0b0c`, zinc-800/900). Aplicados os tokens oficiais do Design System: `--background`, `--primary` (esmeralda), `--gold` / `--secondary`, classes utilitárias `.glass-panel`, `.liquid-button`, `.eyebrow` e fontes Space Grotesk / Inter.
  - **Lógica e Contratos Intactos**: Preservada integralmente a lógica de envio de sinais de interesse em `feedback.tsx` e o descadastro em 2 níveis (`temporary_6m` vs `permanent`) em `unsubscribe.tsx`.

- **Preservação e Suporte a Logomarcas Vetoriais SVG (`src/lib/image-transform.ts` & `src/lib/uploads.ts`)**:
  - **Bypass de Transformação para SVG**: A API de transformação do Supabase (`render/image`) não processa arquivos vetoriais `.svg`. A função `getOptimizedImageUrl` agora detecta extensões `.svg` (ou parâmetros `format=svg`) e retorna a URL original diretamente do bucket `public`, evitando que a logo quebre no cabeçalho.
  - **Upload de Branding**: Adicionado o tipo de upload `branding` com suporte a `image/svg+xml`, `image/png`, `image/jpeg` e `image/webp` (até 5MB) em `src/lib/uploads.ts`, integrado ao painel administrativo em `src/routes/_authenticated/admin/visual.tsx`.

- **Componente Unificado de Cabeçalho Público (`src/components/public-header.tsx`)**:
  - Centralizado o cabeçalho público institucional com renderização dinâmica da logomarca da agência (`visual.logo_url`), fallback tipográfico de alto padrão ("Go Team Go"), botão de retorno ao catálogo e navegação consistente entre Home (`/`), Perfil da Atleta (`/athlete/$slug`), Feedback (`/feedback`) e Unsubscribe (`/unsubscribe`).

- **Favicon Oficial da Marca e Fallbacks (`public/favicon.svg`, `public/favicon.ico` e `src/routes/__root.tsx`)**:
  - Criado `public/favicon.svg` com o monograma GTG e brasão atlético nas cores oficiais da agência (verde esmeralda escuro e dourado/âmbar).
  - Gerado `public/favicon.ico` binário nativo para suporte a todos os navegadores legados e modernos.
  - Atualizado `src/routes/__root.tsx` para injetar o favicon SVG nativo com fallback para ICO, mantendo a substituição dinâmica caso a agência configure uma logo customizada em `agency_visual_settings`.

- **Qualidade, Testes e Verificação**:
  - Testes unitários adicionados em `src/lib/image-transform.test.ts` e `src/lib/uploads.test.ts`.
  - Vitest: 17 arquivos de teste, 111 testes executados e 100% aprovados.
  - ESLint: 0 erros e 0 avisos bloqueantes.
  - Compilação de produção (`compile_applet`): Build concluído com sucesso.

## Atualização 2026-09-18 — Correção de Importação: getAgencyLogoImage (TASK-072)

- **Correção em `src/routes/index.tsx`**:
  - Adicionada a importação de `getAgencyLogoImage` a partir de `@/lib/image-transform` no componente `<Catalog>`, solucionando o erro de execução `ReferenceError: getAgencyLogoImage is not defined` no footer da página inicial.
  - Validação completa com 111 testes unitários aprovados e build de produção verificado com sucesso.





