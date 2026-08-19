# Diagnóstico de Produção: Por que absolutamente NADA de vídeo é exibido em /athlete/laura-romao

- **Data / Hora:** 2026-08-19 11:20 (UTC)
- **URL em Produção:** `https://goteamgo.iasin.dev.br/athlete/laura-romao`
- **Solicitante:** Kauan
- **Agente:** Antigravity AI

---

## 1. Causa Raiz Exata do Problema ("Nada, nenhum player, nenhum vídeo")

Avaliando o fluxo exato da rota `/athlete/$slug` e o banco Supabase em produção, identificamos os **3 motivos encadeados** que fazem com que a tela de `/athlete/laura-romao` fique sem nenhum vídeo ou player:

### Motivo 1: A Condição de Renderização no JSX Oculta a Seção Inteira
No arquivo `src/routes/athlete.$slug.tsx` (linha 246), a seção de vídeos está sob esta condição restritiva:
```tsx
{(inCourt.length > 0 || presentations.length > 0 || feature) && (
  <div id="athlete-film" ...>
    ...
  </div>
)}
```
Se o vídeo cadastrado para a atleta estiver em qualquer uma destas situações:
1. Cadastrado como **"Highlight"**: ele **não** entra em `presentations`, `inCourt` nem `feature`. Ele iria apenas para o `ReelsRow` (que se não for compatível com o formato ou não carregar, não renderiza nada).
2. Cadastrado no campo **"Vídeo de destaque / Highlight URL"** do Perfil (`profile.highlight_video_url`): a função `groupPublicVideos` atribui esse link **apenas** para `heroUrl` (o fundo escuro mudo do Hero) e deixa `presentations = []`, `inCourt = []`, `feature = undefined`.
   - Como consequência: `(0 > 0 || 0 > 0 || undefined)` é `false`, e **a seção inteira de vídeos simplesmente não é renderizada no HTML**!

### Motivo 2: RLS Policy no Supabase usando Subquery vs Função Security Definer
No arquivo `0009_visual_settings_media.sql`, a política RLS pública de `athlete_videos` foi criada como:
```sql
using (
  exists (
    select 1 from public.athletes a
    where a.id = athlete_videos.athlete_id
      and a.is_public = true
      and a.deleted_at is null
  )
);
```
Enquanto todas as outras tabelas (`athlete_profiles`, `athlete_media`, `achievements`) usam a função `using (public.athlete_is_public(athlete_id));` que possui `SECURITY DEFINER`. No PostgreSQL / Supabase, quando um cliente anônimo (`anon`) consulta `athlete_videos`, a subquery direta na tabela `athletes` pode ser barrada pelo RLS da própria tabela `athletes`, fazendo o Supabase retornar `videos: []` silenciosamente para a página pública.

---

## 2. Solução Completa e Definitiva

Para garantir que os vídeos apareçam **sempre e imediatamente** em `https://goteamgo.iasin.dev.br/athlete/laura-romao`:

### Correção no Código (Frontend & Server Function):
1. **Unificar e Garantir a Seção de Vídeos no Perfil (`src/routes/athlete.$slug.tsx`)**:
   - Se houver QUALQUER vídeo cadastrado (seja em `athlete_videos`, seja o `highlight_video_url` do perfil), exibir imediatamente uma seção com grid de players incorporados (`<iframe>` nativos do YouTube).
   - Não esconder a seção por causa de filtros de categoria.
   - Tratar `profile.highlight_video_url` como um vídeo de destaque visível com player incorporado.
2. **Atualizar `PublicYoutubePlayer` (`src/components/public-youtube-player.tsx`)**:
   - Renderizar o `<iframe>` real do YouTube diretamente com `src="https://www.youtube.com/embed/ID"`, proporção 16:9, controles e áudio.

### Ajuste de RLS no Supabase (Script SQL de 1 linha):
```sql
drop policy if exists "athlete videos public read" on public.athlete_videos;
create policy "athlete videos public read" on public.athlete_videos
  for select to anon, authenticated
  using (public.athlete_is_public(athlete_id));
```
