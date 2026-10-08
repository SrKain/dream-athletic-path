# Plano de Solução: Revisão Completa de SEO Técnico e GEO (Generative Engine Optimization)

**Data e Hora**: 2026-08-28 05:16  
**Solicitante**: Kauan  
**Agente**: Antigravity / Gemini Agent  
**Status**: `[AGUARDANDO APROVAÇÃO HUMANA]`

---

## 1. Contexto e Objetivos

Este plano estabelece a infraestrutura e arquitetura de **SEO Técnico** e **GEO (Generative Engine Optimization)** para o projeto **dream-athletic-path (Go Team Go Agency)**.

O objetivo do GEO e SEO técnico é garantir que:
1. Motores de busca tradicionais (Google, Bing) indexem e posicionem com autoridade o catálogo e as páginas individuais de cada atleta.
2. Motores de busca generativos e assistentes de IA (ChatGPT / GPTBot / OAI-SearchBot, Claude / ClaudeBot, Gemini / Google-Extended, PerplexityBot, Applebot, Manus) rastreiem, compreendam com precisão a estrutura semântica (JSON-LD Schema.org) e citem o catálogo da Go Team Go como fonte oficial de recrutamento universitário de atletas brasileiros.
3. As rotas privadas e autenticadas (`/admin`, `/portal`, `/proposal`, `/auth`) permaneçam estritamente protegidas e fora de indexação (`noindex`).

**Domínio Canônico de Produção**: `https://portfolio.goteamgoagency.com`

---

## 2. Escopo Detalhado por Bloco

### Bloco 1: Meta Tags Avançadas e Open Graph (`index.tsx` e `athlete.$slug.tsx`)
- **Home (`src/routes/index.tsx`)**:
  - `<title>`: `"Brazilian Volleyball Recruits & College Athletes Catalog | Go Team Go Agency"`
  - `meta description`: Dinâmica baseada na contagem real de atletas carregados pelo loader (ex: `"Explore 12 top Brazilian volleyball recruits ready to compete and study in the USA. Verified academic credentials, game film, and athletic metrics."`).
  - `link rel="canonical"`: `https://portfolio.goteamgoagency.com/` (URL limpa sem query params de filtros).
  - Open Graph completo: `og:title`, `og:description`, `og:url` (`https://portfolio.goteamgoagency.com/`), `og:site_name` (`"Go Team Go Agency"`), `og:locale` (`"en_US"`), `og:type` (`"website"`), `og:image` (imagem do hero com fallback), `og:image:width` (`"1200"`), `og:image:height` (`"630"`).
  - Twitter Card: `twitter:card` (`"summary_large_image"`), `twitter:title`, `twitter:description`, `twitter:image`.
  - Meta Robots: `meta name="robots" content="index, follow, max-image-preview:large"`.

- **Perfil do Atleta (`src/routes/athlete.$slug.tsx`)**:
  - `<title>`: Dinâmico rico em palavras-chave — `${athlete.full_name} — Brazilian ${position} ${sport} | Go Team Go Agency` (ex: `"Ana Silva — Brazilian Setter Volleyball | Go Team Go Agency"`).
  - `meta description`: Dinâmica — `${athlete.full_name}, Brazilian ${position}, class of ${gradYear}. Athletic and academic profile represented by Go Team Go Agency for US college recruitment.`.
  - `link rel="canonical"`: `https://portfolio.goteamgoagency.com/athlete/${slug}`.
  - Open Graph completo: `og:title`, `og:description`, `og:url`, `og:site_name`, `og:locale`, `og:type` (`"profile"`), `og:image` (foto oficial do atleta com fallback), `og:image:width` (`"1200"`), `og:image:height` (`"630"`).
  - Twitter Card: `twitter:card` (`"summary_large_image"`), `twitter:title`, `twitter:description`, `twitter:image`.
  - Meta Robots: `meta name="robots" content="index, follow, max-image-preview:large"`.
  - Fallback 404 (atleta não encontrado): Mantém `{ name: "robots", content: "noindex" }`.

### Bloco 2: Dados Estruturados (JSON-LD / Schema.org)
- **Home (`src/routes/index.tsx`)**:
  1. `SportsOrganization`:
     ```json
     {
       "@context": "https://schema.org",
       "@type": "SportsOrganization",
       "name": "Go Team Go Agency",
       "url": "https://portfolio.goteamgoagency.com",
       "logo": "...",
       "description": "Catalog and tracking platform for Brazilian athletes pursuing opportunities in the United States."
     }
     ```
  2. `ItemList` / `CollectionPage`:
     ```json
     {
       "@context": "https://schema.org",
       "@type": "ItemList",
       "name": "Go Team Go Athlete Catalog",
       "description": "Recruitment portfolio of Brazilian student-athletes seeking US college opportunities.",
       "numberOfItems": 12,
       "itemListElement": [
         {
           "@type": "ListItem",
           "position": 1,
           "name": "Nome do Atleta",
           "url": "https://portfolio.goteamgoagency.com/athlete/slug"
         }
       ]
     }
     ```
- **Perfil do Atleta (`src/routes/athlete.$slug.tsx`)**:
  1. `Person` (com propriedades esportivas contextuais):
     ```json
     {
       "@context": "https://schema.org",
       "@type": "Person",
       "name": "Nome do Atleta",
       "nationality": "Brazil",
       "birthDate": "2006-05-12",
       "url": "https://portfolio.goteamgoagency.com/athlete/slug",
       "image": "url-da-foto",
       "affiliation": {
         "@type": "SportsOrganization",
         "name": "Go Team Go Agency",
         "url": "https://portfolio.goteamgoagency.com"
       },
       "jobTitle": "Setter — Volleyball",
       "hasOccupation": {
         "@type": "Occupation",
         "name": "Student-Athlete",
         "occupationalCategory": "Athlete"
       }
     }
     ```
  2. `BreadcrumbList`:
     ```json
     {
       "@context": "https://schema.org",
       "@type": "BreadcrumbList",
       "itemListElement": [
         { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://portfolio.goteamgoagency.com/" },
         { "@type": "ListItem", "position": 2, "name": "Catalog", "item": "https://portfolio.goteamgoagency.com/#catalog" },
         { "@type": "ListItem", "position": 3, "name": "Nome do Atleta", "item": "https://portfolio.goteamgoagency.com/athlete/slug" }
       ]
     }
     ```
  3. **Breadcrumb Visual**: Inclusão de um componente breadcrumb minimalista, sutil e acessível no topo da página do atleta (`Home > Catalog > [Athlete Name]`), reforçando a navegação do usuário e a hierarquia semântica.

### Bloco 3: Sitemap.xml Dinâmico (`src/server.ts`)
- Servidor TanStack Start / Nitro em `src/server.ts` responderá requisições para `/sitemap.xml`:
  - `Content-Type: application/xml; charset=utf-8`.
  - Cabeçalho de cache eficiente (`Cache-Control: public, max-age=3600, s-maxage=3600`).
  - Entrada para a Home: `https://portfolio.goteamgoagency.com/` com `changefreq: daily` e `priority: 1.0`.
  - Entradas para cada atleta público ativo no banco Supabase (`is_public = true`):
    - URL: `https://portfolio.goteamgoagency.com/athlete/{slug}`
    - `lastmod`: ISO Date (YYYY-MM-DD) baseado em `created_at` do atleta.
    - `changefreq: weekly`
    - `priority: 0.8`
  - Rotas autenticadas (`/admin`, `/portal`, `/proposal`, `/login`, etc.) não serão incluídas.

### Bloco 4: Robots.txt Otimizado para Bots de IA & Motores Tradicionais (`public/robots.txt`)
- Inclusão explícita de regras de permissão para crawlers de IA:
  - `GPTBot`, `ChatGPT-User`, `OAI-SearchBot`, `ClaudeBot`, `Claude-Web`, `anthropic-ai`, `PerplexityBot`, `Google-Extended`, `Applebot-Extended`.
  - Manutenção de `Googlebot`, `Bingbot`, `Twitterbot`, `facebookexternalhit` e `User-agent: *`.
  - Referência no rodapé do arquivo: `Sitemap: https://portfolio.goteamgoagency.com/sitemap.xml`.

### Bloco 5: Hierarquia de Headings Semânticos (H1-H6)
- Auditar e garantir hierarquia rigorosa:
  - Exatamente um `<h1>` na Home (Hero do catálogo) e exatamente um `<h1>` no Perfil do Atleta (Hero com nome da atleta).
  - Títulos de seções (`Fact Sheet`, `About Athlete`, `Achievements`, `Gallery`, `Highlights`, `Game Film`, `Recruiting Inquiry`) estruturados como `<h2>`.
  - Subseções e cards como `<h3>` ou `<h4>` sem pular níveis de cabeçalho.
  - Seções com `id` contendo título semântico correspondente no início.

### Bloco 6: Alt Texts Descritivos e Acessíveis
- Foto principal do atleta: `alt="{full_name} — {position} — Go Team Go Agency headshot"`.
- Fotos da galeria: `alt="{full_name} — action photo {n}"` (ou legenda caso exista).
- Logomarca da agência (header/footer): `alt="Go Team Go Agency logo"`.
- Cards de atletas na Home: `alt="{full_name} — {position}, {country}"`.
- Eliminação de qualquer `alt=""` em imagens de conteúdo real.

---

## 3. Arquivos Envolvidos

| Arquivo | Ação | Responsabilidade |
| :--- | :---: | :--- |
| `src/routes/index.tsx` | **Edição** | Meta tags ricas, canonical limpo, JSON-LD (`SportsOrganization` e `ItemList`), alt texts dos cards e headings semânticos. |
| `src/routes/athlete.$slug.tsx` | **Edição** | Meta tags específicas, canonical absoluto, JSON-LD (`Person` e `BreadcrumbList`), breadcrumb visual, alt texts completos e validação de headings. |
| `src/server.ts` | **Edição** | Rota de servidor para `/sitemap.xml` dinâmico consultando atletas públicos no Supabase com XML válido. |
| `public/robots.txt` | **Edição** | Liberação explícita de crawlers de IA e referência ao `sitemap.xml`. |
| `think/2026-08-28-0516-revisao-seo-tecnico-geo.md` | **Criação** | Registro formal do plano de implementação e governança de IA. |
| `CERNE.md` | **Edição** | Registro da nova capacidade de SEO técnico, GEO e Schema.org no sistema. |
| `BACKLOGER.md` | **Edição** | Registro da nova tarefa executada e seu status. |

---

## 4. Critérios de Aceite e Validação

1. ✅ **Validação de Meta Tags**: Home e página de atleta com title rico, meta description dinâmica, canonical absoluto, Open Graph completo com dimensões 1200x630 e Twitter card tags espelhadas.
2. ✅ **JSON-LD Válido**: Schema.org sem erros de sintaxe (validado conforme especificações de `SportsOrganization`, `ItemList`, `Person` e `BreadcrumbList`).
3. ✅ **Sitemap.xml Dinâmico**: `/sitemap.xml` servindo XML válido com Content-Type correto e listando todas as atletas públicas ativas.
4. ✅ **Robots.txt Completo**: Com permissões para todos os crawlers de IA líderes e link para o sitemap.
5. ✅ **Headings e A11y**: Hierarquia H1-H6 estrita sem saltos arbitrários e alt text descritivo em todas as imagens.
6. ✅ **Preservação de Funcionalidades**: Sem quebras no feed de stories, player de vídeo, filtros, WhatsApp FAB, Analytics e Clarity.
7. ✅ **Build & Lint**: `npm run lint`, `npm run typecheck` e `compile_applet` passando com 0 erros.
8. ✅ **Governança**: `CERNE.md` e `BACKLOGER.md` atualizados ao final.
