# Plano de Solução: Entrega — Home Pública, Identidade Visual e Cadastro

**Status:** `[PENDENTE DE APROVAÇÃO HUMANA]`  
**Data/Hora:** 2026-08-20 12:25 (-07:00) / 16:25 (BRT)  
**Solicitante:** Kauan  
**Executor:** Antigravity AI

---

## 1. Contexto e Visão Geral da Entrega

O objetivo desta entrega é aprimorar a experiência pública, a consistência de identidade visual e o fluxo de cadastro da plataforma **Go Team Go / Sport Scout Hub**, dividida em 6 blocos incrementais:

- **Bloco 1**: Header e navegação (remover botão "Área restrita" e sigla "NCAA" da logo).
- **Bloco 2**: Identidade visual editável pela Agência (upload de logo, hero editável, novo layout do hero com máscara em degradê verde → transparente).
- **Bloco 3**: OG Image dinâmica por atleta (geração server-side/edge espelhando o hero).
- **Bloco 4**: Catálogo de atletas (remoção da seção Destaques, exibição de país, altura em pés/pol, nome e posição).
- **Bloco 5**: Internacionalização e unidades (tradução integral da Home para inglês US, conversão para sistema imperial, lista completa ISO 3166 de nacionalidades e combobox pesquisável no admin).
- **Bloco 6**: WhatsApp (unificação para `+55 11 99923-9490` e nova mensagem padrão de recrutamento em inglês).

Conforme o protocolo de governança (`README.md`, `CERNE.md`, `AGENTS.md`, `UI&UX.md`), a implementação será executada de forma incremental com aprovação explícita a cada bloco.

---

## 2. Detalhamento dos Blocos Iniciais (Bloco 6 e Bloco 1)

### Bloco 6 — WhatsApp (6.1 e 6.2)

- **Objetivo**:
  1. Centralizar e atualizar o número do WhatsApp de recrutamento para `5511999239490` em `src/lib/contact.ts`.
  2. Atualizar a mensagem padrão em `buildRecruitWhatsappUrl(athleteName)` para o texto literal:
     `"Hello! I'm interested in recruiting [Athlete's Name] through Go Team Go Agency. I'd love to learn more about her and discuss her availability and recruiting profile."`
  3. Atualizar a mensagem padrão do botão genérico do catálogo (`WhatsappFab` sem atleta especificado) para inglês correspondente (ex: `"Hello! I'd like to talk to Go Team Go Agency about the athletes in the catalog."`).
- **Arquivos Afetados**:
  - `src/lib/contact.ts`
  - `src/components/whatsapp-fab.tsx`

### Bloco 1 — Header, Navegação e Identidade Visual (1.1 e 1.4)

- **Objetivo**:
  1. Remover o link/botão "Área restrita" do header público em `src/routes/index.tsx` (preservando intactas as rotas `/login`, `/_authenticated/*` e o acesso direto administrativo).
  2. Remover a sigla `"NCAA"` (`<span className="eyebrow ...">NCAA</span>`) ao lado da logo "Go Team Go" no `<header>` de `src/routes/index.tsx`.
- **Arquivos Afetados**:
  - `src/routes/index.tsx`

---

## 3. Planejamento Arquitetural dos Blocos Subsequentes

### Bloco 5.3 (Países ISO 3166) & 5.2 (Unidades Imperiais)

- **Migration `0011_countries_iso.sql`**: popular a tabela `countries` com a lista completa de países (ISO 3166-1 alpha-2, nomes em EN/PT e bandeiras emoji).
- **Combobox no Admin**: substituir o `<select>` simples em `src/routes/_authenticated/admin/athletes/$id.tsx` e `index.tsx` pelo componente `SearchableSelect` / Command com autocomplete.
- **Unidades Imperiais**:
  - Manter o armazenamento em `height_cm` / `weight_kg` no PostgreSQL para integridade de dados e padronização.
  - Criar helper centralizado `src/lib/units.ts` com funções `formatHeightImperial(heightCm)` (ex: `185` -> `6'1"`) e `formatWeightImperial(weightKg)` (ex: `75` -> `165 lbs`).
  - Aplicar no card do catálogo (`AthleteCardItem`), perfil público (`athlete.$slug.tsx`), admin e propostas.

### Bloco 4 — Catálogo (Cards de Atletas)

- Remover a prateleira `AthleteShelf title="Destaques"` em `src/routes/index.tsx`.
- Atualizar `AthleteCardItem` para exibir harmoniosamente:
  - Nome do atleta (em destaque com `font-display`)
  - Posição
  - Altura formatada em pés e polegadas (ex: `5'11"`)
  - País (com bandeira emoji e nome)

### Bloco 5.1 — Tradução Integral da Home para Inglês

- Migrar todas as strings estáticas da Home (`src/routes/index.tsx`) para o sistema de i18n (`src/i18n/messages.ts` / `useI18n`), garantindo suporte 100% US English.

### Bloco 2 — Identidade Visual Editável pela Agência

- **Migration `0012_agency_branding.sql`**:
  - Adicionar colunas `logo_url TEXT` e `hero_background_url TEXT` à tabela `agency_visual_settings`.
- **Admin (`admin/visual.tsx`)**:
  - Campos de upload para Logo da agência e Imagem de fundo do Hero com envio para o bucket do Supabase Storage.
- **Header, Footer e Favicon**:
  - Header: renderizar a logo da agência (ou fallback textual "Go Team Go").
  - Rodapé: criação de rodapé profissional e elegante com a logo e contatos.
  - Favicon e OG da Home: servir dinamicamente ou atualizar meta tags.
- **Novo Hero da Home**:
  - Layout simplificado em tela cheia com a imagem de fundo configurada e máscara em degradê de verde esmeralda opaco (esquerda) para transparente (direita), posicionando título, subtítulo e busca com contraste e legibilidade impecáveis.

### Bloco 3 — OG Dinâmica por Atleta

- Implementação de rota server-side/edge (`/athlete/$slug/og.png` ou endpoint TanStack Start/Nitro) com `@vercel/og` / Satori renderizando card 1200×630 com a foto do atleta, máscara verde, tipografia Space Grotesk, nome, posição, altura e país.

---

## 4. Impactos, Riscos e Alternativas

- **Segurança**: As rotas de login e administração continuam totalmente funcionais e protegidas por autenticação e RLS; apenas o botão visual no header público é removido.
- **Compatibilidade**: Links e integrações do WhatsApp continuam universais e agora devidamente em inglês para coaches internacionais.
- **Integridade de Dados**: Medidas armazenadas em cm/kg com conversão na camada de apresentação evitam migrations destrutivas de dados existentes.

---

## 5. Estratégia de Validação

1. **Linting & Compilação**: Executar `npm run lint` e `bun run build` / `compile_applet` a cada bloco.
2. **Validação Visual**: Testar responsividade em viewport mobile (375px) e desktop (1280px).
3. **Verificação de Links**: Testar disparos do WhatsApp no desktop e mobile verificando o formato da URL codificada e número destino.

---

## 6. Próximo Passo

Aguardando aprovação humana para executar o **Bloco 6 (WhatsApp)** e **Bloco 1 (Header/Navegação)**.
