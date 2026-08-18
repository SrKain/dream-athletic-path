# Aba Visual + Catálogo público em formato portfólio

## O que muda para você

### 1. Nova aba "Visual" no admin

Menu lateral da agência ganha **Visual** (`/admin/visual`), com:

- **Hero do catálogo**: título e subtítulo (PT/EN) editáveis, com preview.
- **Cabeçalho da lista**: texto padrão "Nossos Atletas", editável.
- **Ordenação das categorias**: lista de posições arrastável (drag & drop) que define a ordem das prateleiras do catálogo. Posições novas entram no fim automaticamente.

### 2. Catálogo público (home)

- Hero mais baixo (altura reduzida, sem ocupar a tela inteira).
- Cabeçalho "Nossos Atletas" logo acima da barra de pesquisa.
- Selo "Destaque" com contraste corrigido (fundo escuro sólido + texto claro, token semântico).
- Filtro/agrupamento por esporte removido de toda a aplicação (vôlei é o único esporte): sem seletor de esporte, prateleiras agrupadas só por posição, na ordem definida na aba Visual.
- **Prévia em vídeo nos cards**: no desktop, ao passar o mouse, o vídeo Destaque (YouTube) toca mudo dentro do card; no mobile, o card mais próximo do centro da tela toca automaticamente e os demais param. Sem vídeo, o card mantém a foto.
- **Botão flutuante do WhatsApp** na home e na página do atleta.

### 3. Perfil público do atleta (formato portfólio)

Ordem da página:

1. **Hero**: vídeo Destaque como fundo, mudo, em loop, sob uma máscara/gradiente escuro — a foto do atleta continua sendo o elemento principal em primeiro plano, com nome, posição e stats.
2. **Reels (Highlights)**: bolinhas circulares horizontais; ao tocar, abre um player vertical em tela cheia com rolagem infinita entre os highlights (doom scroll), estilo Instagram.
3. **Sobre**: bio + vídeo de **Apresentação** em destaque.
4. **Destaque** reaparece como bloco de vídeo completo no meio da apresentação.
5. **Conquistas**: cada conquista com imagem + texto lado a lado.
6. CTA final RECRUTAR (mantido) + botão flutuante do WhatsApp.

### 4. Ficha do atleta no admin (abas)

A tela vira 3 abas: **Timeline**, **Dados do atleta**, **Perfil & mídia**.
Na aba Perfil & mídia:

- Campos de vídeo por **link do YouTube**: Apresentação, Destaque, e lista de Highlights (vários links, reordenáveis).
- Validação do link e preview da miniatura.
- Conquistas ganham campo de **imagem** (upload) junto do texto.

## Detalhes técnicos

**Banco (nova migração `0009_visual_settings_media.sql`)**

- `agency_visual_settings` (agency_id PK, hero_title_pt/en, hero_subtitle_pt/en, catalog_heading_pt/en) — SELECT para `anon`+`authenticated`, escrita só agency_admin; GRANTs explícitos.
- `catalog_position_order` (agency_id, position_id, sort_order) — leitura pública, escrita agency_admin.
- `athlete_videos` (id, athlete_id, kind: `presentation|highlight|feature`, youtube_url, title, sort_order) — leitura pública para atletas publicados, escrita agency_admin. GRANTs + RLS conforme padrão do projeto.
- `achievements.image_url` já existe; será usado no admin e no público.
- `sport_id` permanece no schema (sem migração destrutiva), mas deixa de ser lido/exibido em qualquer UI.

**Frontend**

- `src/lib/youtube.ts`: parser de ID (watch, youtu.be, shorts, embed) + geradores de URL de embed/thumb.
- `src/components/youtube-hover-preview.tsx` (card) e `src/hooks/use-in-view-autoplay.ts` (mobile centro-da-tela via IntersectionObserver).
- `src/components/reels-viewer.tsx`: overlay full-screen com snap scroll vertical e embeds do YouTube.
- `src/lib/catalog.ts`: remove agrupamento por esporte, passa a receber a ordem manual de posições.
- `src/lib/athletes.functions.ts`: loaders públicos passam a devolver `visualSettings`, `positionOrder` e `videos`.
- `src/routes/_authenticated/admin/visual.tsx` (nova) e refactor de `admin/athletes/$id.tsx` em abas (shadcn `Tabs`) com subcomponentes extraídos.
- `src/components/whatsapp-fab.tsx` reutilizando `buildRecruitWhatsappUrl`.
- Tudo com tokens semânticos do design system, mobile-first, conforme `UI&UX.md`.

**Documentação**: `CERNE.md` e `BACKLOGER.md` atualizados ao fim.

**Ação necessária sua**: rodar a migração `0009` no Supabase antes de usar a aba Visual.
