# Planejamento: Renderização da Logo da Agência no Header da Página do Atleta

**Data:** 2026-08-20 19:40  
**Status:** `[PENDENTE DE APROVAÇÃO HUMANA]`  
**Solicitante:** Kauan  
**Executor:** Antigravity AI

---

## 1. Contexto & Diagnóstico

### 🎯 Problema Identificado:

- No catálogo público (**Home** - `src/routes/index.tsx`), o cabeçalho renderiza dinamicamente a logomarca da agência (`visual.logo_url`) obtida da tabela `agency_visual_settings`. Se houver logo cadastrada, a imagem é exibida; caso contrário, exibe o fallback textual `"Go Team Go"`.
- Na página pública de perfil do atleta (**Perfil do Atleta** - `src/routes/athlete.$slug.tsx`), o `<header>` (elemento selecionado no Focus Mode) continha apenas o texto estático `"Go Team Go"` em `<Link to="/">` e não recebia as configurações visuais (`visual.logo_url`) no payload do loader.
- Isso gera uma quebra de consistência de identidade visual e branding entre a Home e as páginas de detalhes dos atletas.

---

## 2. Proposta de Solução

### 📋 Ações Planejadas:

1. **Atualização do Loader do Perfil (`src/lib/athletes.functions.ts`):**
   - Atualizar a tipagem `PublicAthletePayload` para incluir `visual: AgencyVisualSettings | null`.
   - Na função `getPublicAthlete`, incluir na query paralela (`Promise.all`) a busca das configurações visuais da agência: `client.from("agency_visual_settings").select("*").limit(1).maybeSingle()`.
   - Retornar o campo `visual` dentro do payload carregado pelo loader.

2. **Renderização Consistente no Header (`src/routes/athlete.$slug.tsx`):**
   - No componente `PublicAthleteProfile`, extrair `visual` de `Route.useLoaderData()`.
   - No elemento focado (`header > div`), atualizar o `<Link to="/" ...>` para renderizar:
     - Se `visual?.logo_url` existir: tag `<img>` com `src={visual.logo_url}`, `alt="Go Team Go"`, mantendo altura fluida (`h-8 md:h-9 w-auto object-contain`) idêntica ao design system e à Home.
     - Fallback: `<span className="font-display text-xl font-bold tracking-tight text-foreground">Go Team Go</span>`.
   - Manter perfeitamente o botão de retorno `<Link to="/"><ArrowLeft /> Back to Catalog</Link>` alinhado à direita.

3. **Documentação Viva e Rastreabilidade:**
   - Registrar a solicitação no `BACKLOGER.md`.
   - Atualizar `CERNE.md` com a expansão do payload de `getPublicAthlete` e unificação do componente de header.

---

## 3. Arquivos Envolvidos

1. `src/lib/athletes.functions.ts` — Inclusão de `visual` em `PublicAthletePayload` e query no Supabase.
2. `src/routes/athlete.$slug.tsx` — Renderização condicional da imagem da logo ou fallback no header.
3. `BACKLOGER.md` — Registro de governança da tarefa.
4. `CERNE.md` — Atualização da documentação de payloads e componentes.

---

## 4. Próximo Passo

Aguardando aprovação explícita do usuário para aplicar as alterações nos arquivos de código.
