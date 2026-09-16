# Planejamento Estratégico: Redução Drástica de Custo de Egress (Storage + PostgREST) no Supabase (TASK-060)

**Data e Hora**: 2026-09-03 12:30  
**Solicitante**: Kauan (Usuário Humano)  
**Agente**: Antigravity AI  
**Status**: `[AGUARDANDO APROVAÇÃO HUMANA PRÉVIA]`

---

## 1. Diagnóstico e Auditoria com Métricas Reais do Ambiente

A aplicação ultrapassou a cota de "Cached Egress" do Supabase após um pico real de ~1000 coaches acessando o catálogo público e as páginas de atletas.

Realizamos uma auditoria prática nas requisições reais do Supabase do projeto (`https://ugxoweynkdzzfdbbppnv.supabase.co`):

### 1.1 Auditoria do Storage (66,1% do Egress)

- **Tamanho das imagens originais**: Cada foto de atleta em `athlete-media` chega a **1.261.645 bytes (~1.232 KB / 1,23 MB)**.
- **Header atual de Cache nos objetos existentes**:
  `Cache-Control: no-cache` | `CF-Cache-Status: MISS`
- **Impacto**: Cada coach navegando pelo catálogo com 30 atletas realizava o download de **~37 MB de imagens brutas**. Com 1000 coaches e sem cache do browser/CDN, isso gerou **~37 GB de tráfego de Storage Egress** em um único dia.
- **Teste com Supabase Image Transformation**:
  Testamos diretamente o endpoint oficial `/storage/v1/render/image/public/...` na infraestrutura do cliente:
  - Card do Catálogo (400x533, cover, q80): de **1.232 KB** para **36,5 KB** (**Redução de 97,04%**).
  - Story Bar Avatar (120x120, cover, q75): de **1.232 KB** para **4,1 KB** (**Redução de 99,66%**).
  - Foto Hero do Perfil (700w, q75): de **1.232 KB** para **338 KB** (**Redução de 72,56%**).
  - Miniatura de Galeria (600x450, cover, q80): de **1.232 KB** para **39,1 KB** (**Redução de 96,82%**).
  - O endpoint de transformação **está 100% ativo e suportado no plano do cliente** (HTTP 200 retornado nos testes).

### 1.2 Auditoria do PostgREST (33,8% do Egress)

- **Falta de Cache em Edge (Vercel)**: As rotas públicas (`/` e `/athlete/$slug`) e os server functions executam em SSR sem headers de CDN (`s-maxage`, `stale-while-revalidate`), batendo no PostgREST a cada carregamento de página de cada visitante.
- **Queries com `select('*')`**:
  - `getPublicAthlete` executa 5 queries em paralelo com `select('*')` em `athlete_profiles`, `athlete_media`, `achievements`, `athlete_videos` e `agency_visual_settings`.
  - `listPublicAthletes` traz colunas não utilizadas no card (como `cover_url`, `weight_kg`, `birth_date`, `nationality`, `sport_id`, etc.) e roda `athlete_video_likes.select('video_id')` varrendo todos os likes.
- **Ausência de Paginação Controlada**: O catálogo carrega todos os atletas cadastrados de uma só vez (atualmente fixado em limit 60).

---

## 2. Solução Proposta e Plano de Ação

O plano é dividido exatamente nos 4 pilares solicitados:

### Pilar 1: Cache-Control de Longo Prazo no Supabase Storage

1. **Buckets Públicos Identificados**:
   - `athlete-media` (fotos de perfil, capa, galeria, logo da agência, hero background, favicon)
   - `proposal-assets` (fotos de apresentação de propostas)
   - `stage-celebrations` (imagens comemorativas de etapas)
2. **Uploads Futuros com Cache Imutável**:
   - Atualizar todos os pontos de upload em `src/routes/_authenticated/admin/athletes/$id.tsx`, `src/routes/_authenticated/admin/visual.tsx` e `src/routes/_authenticated/admin/settings.tsx` incluindo `cacheControl: "31536000"` (1 ano).
3. **Estratégia de Cache-Busting para Assets Editáveis**:
   - Como os uploads já utilizam UUIDs ou timestamps no caminho (ex: `agency/branding/hero-${Date.now()}.jpg` e `${athleteId}/${crypto.randomUUID()}-photo.jpg`), cada alteração gera uma URL nova e única, permitindo que o cache de 1 ano seja seguro e livre de conteúdo obsoleto.
4. **Script de Correção dos Objetos Já Existentes**:
   - Criar `scripts/update-storage-cache-control.ts` (executável via Node/Bun):
     - Percorre recursivamente todos os arquivos existentes nos buckets públicos.
     - Lê o objeto e reaplica o metadata com `cacheControl: "31536000"` via `@supabase/supabase-js`.
   - Adicionalmente, fornecer migration SQL (`db/migrations/0017_storage_cache_control_and_update_policy.sql`) que:
     - Permite atualização em massa via SQL em `storage.objects` atualizando `metadata = jsonb_set(metadata, '{cacheControl}', '"max-age=31536000, public, immutable"')`.
     - Adiciona política de RLS `UPDATE` para administradores no bucket `athlete-media` (que atualmente só possui INSERT e DELETE).

### Pilar 2: Otimização e Transformação de Imagens em Tempo de Exibição

1. **Utilitário Centralizado de Otimização (`src/lib/image-transform.ts`)**:
   - Criar a função `getOptimizedImageUrl(url, options)`:
     - Detecta se a URL provém do Supabase Storage (`/storage/v1/object/public/...`).
     - Converte transparentemente para o endpoint `/storage/v1/render/image/public/...` injetando parâmetros de largura, altura, corte (`resize=cover`) e qualidade (`quality=75-80`).
     - Se for imagem local (`/assets/...`) ou externa (Unsplash/Imgur), preserva a URL original sem quebras.
2. **Aplicação nos Componentes Públicos**:
   - **Cards do Catálogo (`src/components/athlete-video-card-media.tsx`)**:
     Renderiza em 400x533 px, qualidade 80. Economia de **~97%** por card.
   - **Barra de Stories / Highlights da Home (`src/components/home-highlights-story-bar.tsx`)**:
     Renderiza avatares em 120x120 px, qualidade 75. Economia de **~99.6%**.
   - **Hero Background do Catálogo (`src/routes/index.tsx`)**:
     Renderiza com max-width 1200 px, qualidade 80.
   - **Logo do Header e Rodapé (`src/routes/index.tsx` e `src/routes/athlete.$slug.tsx`)**:
     Renderiza em 240 px de largura, qualidade 85.
   - **Página de Perfil do Atleta (`src/routes/athlete.$slug.tsx`)**:
     - Foto Principal (Hero): largura 700 px, qualidade 75.
     - Miniaturas da Galeria: 600x450 px, qualidade 80.
     - Próximo Atleta Recomendado: 400x533 px, qualidade 80.
     - OG Image (`head`): 1200x630 px, qualidade 85.

### Pilar 3: Caching em Camada de CDN/Edge (Vercel Edge & TanStack Start)

1. **Interceptação no Entrypoint do Servidor (`src/server.ts`)**:
   - Configurar cabeçalhos de resposta HTTP para requisições públicas `GET`:
     - Rota Catálogo (`/`):
       `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=86400`
       (60s no browser do usuário, 5 minutos no Edge Cache da Vercel, servindo stale em segundo plano por até 24h enquanto revalida silenciosamente).
     - Rota Perfil do Atleta (`/athlete/:slug`):
       `Cache-Control: public, max-age=120, s-maxage=900, stale-while-revalidate=86400`
       (15 minutos no Edge Cache da Vercel).
     - Server Function calls públicos (`/_serverFn/listPublicAthletes`, `/_serverFn/getPublicAthlete`):
       `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=86400`.
2. **Proteção Total das Rotas Autenticadas**:
   - Rotas administrativas (`/admin/*`), portal do atleta (`/portal/*`) e requisições com cookies de autenticação ou cabeçalhos `Authorization` receberão estritamente `Cache-Control: private, no-cache, no-store, must-revalidate`, garantindo que ações de agência nunca sejam armazenadas em cache.

### Pilar 4: Otimização do Payload PostgREST e Paginação

1. **Otimização de `listPublicAthletes` (`src/lib/athletes.functions.ts`)**:
   - Reduzir `PUBLIC_ATHLETE_SELECT` removendo campos dispensáveis na listagem (`cover_url`, `weight_kg`, `birth_date`, `nationality`, `sport_id`, `name_pt`).
   - Trocar `agency_visual_settings.select('*')` por `select('logo_url, hero_background_url, hero_title_en, hero_description_en, hero_cta_en')`.
   - Limitar `athlete_videos` apenas às colunas estritamente necessárias (`id, athlete_id, youtube_url, kind, sort_order, title, created_at`).
   - Otimizar a consulta de likes: buscar apenas likes relacionados aos vídeos que de fato são highlights.
   - Implementar paginação estruturada no catálogo (com suporte a carga inicial otimizada e botão/gatilho de carregar mais caso a base expanda).
2. **Otimização de `getPublicAthlete` (`src/lib/athletes.functions.ts`)**:
   - Substituir todos os `select('*')` por selects explícitos contendo apenas os campos exibidos no perfil (ex: bio_en, gpa, sat_score, touches, transfer college, etc., descartando timestamps de auditoria interna e colunas em português legadas).

---

## 3. Matriz de Arquivos Afetados

| Arquivo                                                          |      Ação       | Responsabilidade                                                                                                                                |
| :--------------------------------------------------------------- | :-------------: | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/image-transform.ts`                                     |   **Criação**   | Helper que converte URLs de objetos públicos do Supabase em URLs do endpoint `/render/image/public` com dimensões e qualidade otimizadas.       |
| `src/routes/_authenticated/admin/athletes/$id.tsx`               | **Modificação** | Adicionar `cacheControl: "31536000"` no upload de fotos, mídias e vídeos.                                                                       |
| `src/routes/_authenticated/admin/visual.tsx`                     | **Modificação** | Adicionar `cacheControl: "31536000"` no upload de logo e hero da agência.                                                                       |
| `src/routes/_authenticated/admin/settings.tsx`                   | **Modificação** | Adicionar `cacheControl: "31536000"` no upload de fotos comemorativas do portal.                                                                |
| `src/routes/_authenticated/admin/proposals/$id.tsx`              | **Modificação** | Adicionar `cacheControl: "31536000"` no upload de assets de propostas.                                                                          |
| `src/server.ts`                                                  | **Modificação** | Configurar cabeçalhos `Cache-Control` CDN Edge (`s-maxage`, `stale-while-revalidate`) para rotas públicas (`/`, `/athlete/$slug`, `_serverFn`). |
| `src/lib/athletes.functions.ts`                                  | **Modificação** | Substituir `select('*')` por projeções enxutas e otimizar queries de feed e likes.                                                              |
| `src/components/athlete-video-card-media.tsx`                    | **Modificação** | Servir imagem de card otimizada (400x533 px, 36 KB).                                                                                            |
| `src/components/home-highlights-story-bar.tsx`                   | **Modificação** | Servir avatares de stories otimizados (120x120 px, 4 KB).                                                                                       |
| `src/routes/index.tsx`                                           | **Modificação** | Servir logo e hero background otimizados.                                                                                                       |
| `src/routes/athlete.$slug.tsx`                                   | **Modificação** | Servir fotos hero, galeria e recomendações otimizadas.                                                                                          |
| `scripts/update-storage-cache-control.ts`                        |   **Criação**   | Script para varrer e aplicar `Cache-Control` longo nos objetos já existentes no Supabase Storage.                                               |
| `db/migrations/0017_storage_cache_control_and_update_policy.sql` |   **Criação**   | Migration SQL com update em massa de metadata de cache e adição de RLS update para `athlete-media`.                                             |
| `BACKLOGER.md`                                                   | **Atualização** | Registro da TASK-060.                                                                                                                           |
| `CERNE.md`                                                       | **Atualização** | Registro da arquitetura de otimização de egress e cache.                                                                                        |

---

## 4. Plano de Testes e Validação

1. **Validação de Imagens**:
   - Verificar no DevTools/Network se as imagens públicas são servidas pelo endpoint `/render/image/public/` e se os tamanhos caíram de ~1.2 MB para ~36 KB por card.
   - Confirmar fidelidade visual idêntica (sem pixelização, mantendo proporção e nitidez perfeitas em telas retina).
2. **Validação de Cache-Control**:
   - Inspecionar headers HTTP das requisições públicas (`/`, `/athlete/$slug`, imagens) e confirmar `Cache-Control: public, max-age=31536000, immutable` para imagens e `s-maxage=300, stale-while-revalidate=86400` para rotas públicas.
   - Confirmar que rotas `/admin/*` permanecem sem cache (`private, no-store`).
3. **Validação do PostgREST**:
   - Checar no payload de rede das server functions que apenas as colunas necessárias estão sendo retornadas, sem arrays gigantescos de likes ou campos nulos.
4. **Validação de Regressão e Build**:
   - Executar testes automatizados (`npm run test`).
   - Executar linter (`npm run lint`).
   - Executar compilação completa de produção (`npm run build`).

---

**Solicitação de Aprovação**: Solicito a aprovação prévia do usuário humano para prosseguir com a implementação de todos os itens deste plano.
