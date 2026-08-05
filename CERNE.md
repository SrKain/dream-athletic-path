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
| [`src/routes/_authenticated/portal/index.tsx`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/routes/_authenticated/portal/index.tsx) | Atleta | **Home do Atleta**: Resumo do progresso, alertas de pendências de documentos e etapa atual. |
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
- [`ui/*`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/components/ui): Biblioteca de componentes atomizados (buttons, dialogs, badges, cards, inputs, dropdowns) construídos sobre Radix UI e Tailwind CSS.

---

## 5. Mapeamento de Módulos e Funções (`src/lib`)

- [`src/lib/auth.functions.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/auth.functions.ts): Funções de controle de sessão, login, registro de convites de atletas, atualização de perfis e verificação de papéis (`agency_admin`, `athlete`, `coach`).
- [`src/lib/athletes.functions.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/athletes.functions.ts): Funções CRUD para criação de atletas pela agência, atualização de mídias, dados esportivos e estatísticas.
- [`src/lib/catalog.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/catalog.ts): Módulo de busca, ordenação e filtragem de atletas públicos para o feed dos Coaches.
- [`src/lib/proposals.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/proposals.ts) & [`proposals.functions.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/proposals.functions.ts): Lógica de criação, edição de blocos, publicação e alteração de status (aceito/recusado) de propostas.
- [`src/lib/uploads.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/uploads.ts): Utilitários para validação de formato/tamanho de arquivos e integração com os buckets do Supabase Storage.
- [`src/lib/error-capture.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/error-capture.ts) & [`lovable-error-reporting.ts`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/src/lib/lovable-error-reporting.ts): Captura resiliente de exceções em ambiente de runtime.

---

## 6. Modelo de Banco de Dados (`src/types/db.ts` e `db/migrations`)

Entidades do PostgreSQL executadas no Supabase Externo:
- `agencies`: Dados da agência proprietária.
- `user_roles`: Mapeamento de usuários Auth e papéis (`agency_admin`, `athlete`, `coach`).
- `athletes`: Tabela principal do atleta (slug, nome, esporte, posição, agência, estágio atual, público/destaque).
- `athlete_profiles`: Informações estendidas (bio em PT/EN, vídeo de destaques, GPA, nível de inglês, estatísticas).
- `athlete_media`: Fotos e vídeos da galeria pública/privada do atleta.
- `achievements`: Conquistas, prêmios e medalhas.
- `pipeline_stages`: Fases do pipeline da agência (Key, Nomes PT/EN, Ordem).
- `athlete_stage_progress`: Progresso individual do atleta em cada etapa (Status: `not_started`, `in_progress`, `blocked`, `completed`).
- `documents`: Documentos enviados (PDF, PNG, JPG) armazenados no Supabase Storage.
- `proposals` & `proposal_versions`: Propostas esportivas formais e controle de versões.
