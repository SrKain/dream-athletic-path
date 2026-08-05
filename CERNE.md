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
- **Serviço de E-mail**: Arquitetura integrada ao **Resend** para notificações transacionais.
- **Qualidade & Testes**: **Vitest**, **ESLint**, **Prettier**.

### Build System & Package Manager

> **⚠️ CRÍTICO**: Este projeto utiliza exclusivamente **[Bun](https://bun.sh)** como package manager e runtime. **NÃO use npm, yarn ou pnpm** — tentativas de build com outros package managers resultarão em erros de dependências e compilação.

**Requisitos obrigatórios**:
- **Bun** >= 1.3.14 *(especificado em `package.json` → `"packageManager": "bun@1.3.14"`)*
- **Node.js** >= 20.19.0 *(especificado em `package.json` → `"engines": {"node": ">=20.19.0"}`)*

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
- [`package.json`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/package.json) — Scripts de build, dependências e versões fixadas de Bun/Node.js
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

| Rota / Arquivo | Acesso / Perfil | Descrição e Problema Resolvido |
| :--- | :--- | :--- |
| [`src/routes/__root.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/__root.tsx) | Público | Shell raiz da aplicação com `QueryClientProvider`, `AppProviders`, injeção de CSS global e manipulador de erros 404/Error Boundary. |
| [`src/routes/index.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/index.tsx) | Público | **Feed Público / Catálogo de Atletas**: Layout estilo streaming (cards de atletas, busca por nome, filtros por esporte/posição, carrosséis de destaques). |
| [`src/routes/athlete.$slug.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/athlete.$slug.tsx) | Público | **Perfil Público do Atleta**: Exibe bio, fotos, vídeos de destaques, estatísticas, GPA, nível de inglês e conquistas para Coaches. |
| [`src/routes/login.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/login.tsx) | Público | **Tela de Login**: Autenticação por e-mail e senha usando Supabase Auth. |
| [`src/routes/forgot-password.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/forgot-password.tsx) | Público | Solicitante de e-mail para recuperação de senha. |
| [`src/routes/reset-password.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/reset-password.tsx) | Autenticado (Token) | Redefinição de senha do usuário. |
| [`src/routes/auth.accept-invite.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/auth.accept-invite.tsx) | Público (Token) | Aceite de convite por novos atletas para definição de senha. |
| [`src/routes/proposal.$token.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/proposal.$token.tsx) | Público (Token) | **Experiência Interativa da Proposta Esportiva**: Exibição da proposta enviada ao atleta com botões de aceite/recusa. |
| [`src/routes/proposal.$token.pdf.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/proposal.$token.pdf.tsx) | Público (Token) | **Download/Stream de PDF**: Renderiza a proposta formatada em documento PDF via `@react-pdf/renderer`. |
| [`src/routes/_authenticated/route.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/route.tsx) | Autenticado | Layout pai autenticado com proteção de rotas e redirecionamento caso não haja sessão. |
| [`src/routes/_authenticated/admin/index.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/admin/index.tsx) | Agência (Admin) | Dashboard da Agência: Visão geral de métricas, atletas cadastrados e atalhos de gestão. |
| [`src/routes/_authenticated/admin/pipeline.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/admin/pipeline.tsx) | Agência (Admin) | **Gestão de Pipeline**: Quadro Kanban/Linha do tempo dos atletas em cada etapa de recrutamento. |
| [`src/routes/_authenticated/admin/documents.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/admin/documents.tsx) | Agência (Admin) | **Central de Documentos**: Aprovação, reprovação e acompanhamento de arquivos enviados pelos atletas. |
| [`src/routes/_authenticated/admin/settings.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/admin/settings.tsx) | Agência (Admin) | Configurações da Agência, etapas do pipeline e parâmetros do sistema. |
| [`src/routes/_authenticated/portal/index.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/portal/index.tsx) | Atleta | **Home do Atleta**: Resumo do progresso, alertas de pendências de documentos e etapa atual. **Atualizado**: Integrado componente `<ConfettiCelebration />` que dispara animação quando URL contém `?celebrate=true`. |
| [`src/routes/_authenticated/portal/pipeline.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/portal/pipeline.tsx) | Atleta | Visualização detalhada do pipeline e etapas a cumprir. |
| [`src/routes/_authenticated/portal/documents.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/portal/documents.tsx) | Atleta | **Envio de Documentos do Atleta**: Upload de PDFs, histórico de status e correções solicitadas pela agência. |
| [`src/routes/_authenticated/portal/media.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/portal/media.tsx) | Atleta | **Envio de Mídias**: Upload de fotos e links/vídeos de destaque para o perfil público. |

---

## 4. Componentes Principais (`src/components`)

- [`app-shell.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/app-shell.tsx): Layout estrutural responsivo com sidebar, navbar, menu mobile e perfil do usuário logado.
- [`stage-timeline.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/stage-timeline.tsx): Componente visual da linha do tempo e checklist interativo das etapas do atleta.
- [`proposal-experience.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/proposal-experience.tsx): Interface de leitura, navegação por blocos e aceite da proposta esportiva pelo atleta.
- [`proposal-pdf.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/proposal-pdf.tsx): Documento estilizado via `@react-pdf/renderer` para geração e exportação da proposta em formato PDF.
- [`athlete-access-card.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/athlete-access-card.tsx): Card de gerenciamento de dados de acesso e convites de atletas para a Agência.
- [`configuration-notice.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/configuration-notice.tsx): Tela explicativa exibida quando o ambiente não possui as chaves públicas do Supabase configuradas no `.env`.
- [`searchable-select.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/searchable-select.tsx): Seletor customizável com busca integrada para posições, esportes e países.
- [`confetti-celebration.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/confetti-celebration.tsx): **[NOVO]** Componente de animação de confetes usando `canvas-confetti`. Dispara automaticamente quando o portal do atleta é acessado com parâmetro `?celebrate=true` (link vindo do e-mail de celebração). Cores emerald (#30b884) e gold (#eab308) do design system. Auto-remove o parâmetro da URL após 3 segundos de animação.
- [`ui/*`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/ui): Biblioteca de componentes atomizados (buttons, dialogs, badges, cards, inputs, dropdowns) construídos sobre Radix UI e Tailwind CSS.

---

## 5. Mapeamento de Módulos e Funções (`src/lib`)

- [`src/lib/auth.functions.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/auth.functions.ts): Funções de controle de sessão, login, registro de convites de atletas, atualização de perfis e verificação de papéis (`agency_admin`, `athlete`, `coach`).
- [`src/lib/athletes.functions.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/athletes.functions.ts): Funções CRUD para criação de atletas pela agência, atualização de mídias, dados esportivos e estatísticas.
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

---

## 6. Modelo de Banco de Dados (`src/types/db.ts` e `db/migrations`)

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
