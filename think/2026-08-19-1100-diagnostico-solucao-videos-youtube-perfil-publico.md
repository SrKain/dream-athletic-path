# Diagnóstico e Solução: Vídeos do YouTube não exibidos / embedados no Perfil Público e Catálogo

- **Data / Hora:** 2026-08-19 11:00 (UTC)
- **Solicitante:** Kauan (Usuário Humano)
- **Agente:** Antigravity AI (AI Studio)
- **Contexto:** Os links do YouTube cadastrados no painel administrativo da agência não estão sendo embedados/exibidos no perfil público do atleta no catálogo.

---

## 1. Diagnóstico e Causa Raiz

Analisamos o fluxo ponta a ponta desde o cadastro no Admin (`src/routes/_authenticated/admin/athletes/$id.tsx`), a persistência nas tabelas do Supabase (`athlete_videos`, `athlete_profiles`), a recuperação dos dados via Server Function (`src/lib/athletes.functions.ts`), até a renderização dos componentes (`src/routes/athlete.$slug.tsx`, `src/components/public-youtube-player.tsx`, `src/lib/public-videos.ts` e `src/routes/index.tsx`).

Identificamos as seguintes causas potenciais e fatores determinantes:

### Causa 1 (Mais Crítica): Migrações do Supabase Externo Pendentes
- A tabela `public.athlete_videos` e o tipo `athlete_video_kind` (com os valores `'presentation'`, `'highlight'`, `'feature'`, `'in_court'`) pertencem às migrações:
  - `db/migrations/0009_visual_settings_media.sql` (cria `athlete_videos`, `agency_visual_settings`, `catalog_position_order`)
  - `db/migrations/0010_athlete_profile_fields.sql` (adiciona `in_court` ao enum `athlete_video_kind`)
- **Se essas migrações SQL não foram executadas no Supabase SQL Editor externo**, as inserções falham ou a consulta pública `getPublicAthlete` (`client.from("athlete_videos").select("*")`) falha com erro e retorna `videos: []`, fazendo com que a página pública do atleta não encontre nenhum vídeo para exibir.

### Causa 2: Políticas RLS (Row Level Security) e Status do Atleta
- A política de segurança RLS para visualização pública de `athlete_videos` é:
  ```sql
  create policy "athlete videos public read" on public.athlete_videos
    for select to anon, authenticated
    using (
      exists (
        select 1 from public.athletes a
        where a.id = athlete_videos.athlete_id
          and a.is_public = true
          and a.deleted_at is null
      )
    );
  ```
- Se o atleta **não estiver com `is_public = true`** no banco (ou estiver arquivado com `deleted_at` preenchido), o Supabase bloqueia a leitura de vídeos para visitantes públicos (role `anon`).
- Se a permissão `grant select on public.athlete_videos to anon;` não tiver sido aplicada, a consulta anônima do SSR/cliente também é bloqueada pelo PostgreSQL.

### Causa 3: Restrições de Incorporação do Próprio YouTube (Embedding Disabled)
- Alguns vídeos no YouTube possuem a configuração de privacidade/direitos autorais **"Permitir incorporação" (Allow embedding) desativada** pelo proprietário no YouTube Studio, ou músicas protegidas por direitos autorais que o YouTube bloqueia de tocar em iframes de outros domínios (apresentando tela preta com código de erro 150/101 no player).
- Nesses casos, o `PublicYoutubePlayer` disponibiliza o botão "Watch on YouTube" como fallback direto, mas o iframe pode ser bloqueado pelo YouTube.

### Causa 4: Formatos e Tratamento de Links do YouTube
- O parser de URL (`parseYoutubeId` em `src/lib/youtube.ts`) precisa cobrir todas as variações de links: `youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...`, `youtube.com/live/...`, `youtube.com/embed/...`, links de celular `m.youtube.com`, além de links com parâmetros extras (`?si=...`, `&t=...`, `&feature=share`).

---

## 2. Plano de Ação e Soluções Formuladas

Para solucionar e garantir o funcionamento 100% dos vídeos:

### Passo 1: Validação do Banco de Dados (Ação Imediata no Supabase)
Executar o script SQL unificado contendo as migrações `0009` e `0010` no Supabase SQL Editor para garantir:
1. Criação do tipo `athlete_video_kind` com `presentation`, `highlight`, `feature`, `in_court`.
2. Criação da tabela `athlete_videos` com índices e chaves estrangeiras.
3. Concessão de permissões `GRANT SELECT ON public.athlete_videos TO anon, authenticated;`.
4. Políticas RLS ativas e permissivas para leitura pública de atletas públicos (`is_public = true`).

### Passo 2: Hardening no Código da Aplicação (Caso Aprovado)
1. **Melhoria no Admin (`src/routes/_authenticated/admin/athletes/$id.tsx`)**:
   - Adicionar verificação explícita de status da tabela com banner informativo caso a tabela `athlete_videos` retorne erro de tabela inexistente ou RLS, orientando o administrador com clareza.
   - Adicionar botão de teste / prévia interativa do player direto na lista de vídeos cadastrados no Admin, para que o usuário veja se o YouTube permite incorporação do link antes mesmo de abrir a página pública.
2. **Reforço no Parser de YouTube (`src/lib/youtube.ts`)**:
   - Garantir suporte a links com parâmetros de busca complexos, links de shorts com timestamp, links mobile e links com `si=`.
3. **Resiliência no Perfil Público (`src/routes/athlete.$slug.tsx` & `src/components/public-youtube-player.tsx`)**:
   - Manter fallback gracioso: se o iframe falhar ou for bloqueado pelo YouTube, exibir thumbnail em alta resolução com botão direto para assistir no YouTube.
   - Fallback retrocompatível: se `athlete_videos` estiver vazio mas o atleta tiver `profile.highlight_video_url` preenchido com link do YouTube, incluí-lo automaticamente nas seções de vídeo.

---

## 3. Script SQL de Verificação e Aplicação Unificada para o Supabase

Caso as migrações ainda não tenham sido aplicadas no Supabase, disponibilizaremos o script SQL completo e idêntico para ser colado no **SQL Editor** do Supabase Dashboard.
