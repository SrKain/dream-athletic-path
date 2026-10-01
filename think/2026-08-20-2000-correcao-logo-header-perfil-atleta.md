# Planejamento: Correção da Exibição da Logo no Header da Página do Atleta

**Data:** 2026-08-20 20:00  
**Status:** `[CONCLUÍDO]`  
**Solicitante:** Usuário Humano  
**Executor:** Antigravity AI  

---

## 1. Contexto do Bug & Causa Raiz

### 🐛 Problema:
- Na Home (`src/routes/index.tsx`), a logomarca da agência cadastrada em `agency_visual_settings.logo_url` é renderizada com sucesso no cabeçalho através do payload retornado por `listPublicAthletes()`.
- Na página pública do atleta (`src/routes/athlete.$slug.tsx`), o cabeçalho sempre exibe o texto fixo `"Go Team Go"`, ignorando a imagem da logo mesmo quando configurada no painel administrativo.

### 🔍 Causa Raiz:
1. Em `src/lib/athletes.functions.ts`, o tipo `PublicAthletePayload` não declara a propriedade `visual: AgencyVisualSettings | null`.
2. A Server Function `getPublicAthlete` não consulta a tabela `agency_visual_settings` em nenhum momento do seu fluxo de carregamento.
3. No componente `PublicAthleteProfile` (`src/routes/athlete.$slug.tsx`), o `<header>` possui um link estático contendo apenas o texto `<Link to="/">Go Team Go</Link>` sem a lógica condicional para renderizar `<img>` com a logo.

---

## 2. Solução Proposta

### 🛠️ 1. `src/lib/athletes.functions.ts`
- Atualizar a interface `PublicAthletePayload`:
  ```ts
  export type PublicAthletePayload = {
    athlete: AthleteCard;
    profile: AthleteProfile | null;
    media: AthleteMedia[];
    achievements: Achievement[];
    videos: AthleteVideo[];
    videosAvailable: boolean;
    nextAthlete?: AthleteCard | null;
    visual: AgencyVisualSettings | null;
  };
  ```
- Na função `getPublicAthlete`, incluir no `Promise.all` em paralelo a consulta à tabela `agency_visual_settings`:
  ```ts
  client.from("agency_visual_settings").select("*").limit(1).maybeSingle()
  ```
- Retornar o campo `visual: (visualResult.data ?? null) as AgencyVisualSettings | null` no payload.

### 🛠️ 2. `src/routes/athlete.$slug.tsx`
- Desestruturar `visual` a partir de `Route.useLoaderData() as PublicAthletePayload`.
- No `<header className="sticky top-0 z-40 ...">`, substituir o link estático de texto pela mesma estrutura e classes utilizadas na Home:
  ```tsx
  <Link to="/" className="flex items-center">
    {visual?.logo_url ? (
      <img
        src={visual.logo_url}
        alt="Go Team Go"
        className="h-8 md:h-10 w-auto object-contain"
      />
    ) : (
      <span className="font-display text-xl md:text-2xl font-bold tracking-tight text-foreground">
        Go Team Go
      </span>
    )}
  </Link>
  ```
- Preservar intactos o botão `"Back to Catalog"`, o comportamento `sticky` e os efeitos de `backdrop-blur`.

### 🛠️ 3. Governança e Documentação Viva
- Atualizar `CERNE.md` com a inclusão de `visual` no payload de `getPublicAthlete` e sincronização do header de perfil do atleta.
- Registrar a tarefa em `BACKLOGER.md` como `[CONCLUÍDO]` após a implementação e testes.

---

## 3. Arquivos Envolvidos

1. `src/lib/athletes.functions.ts`
2. `src/routes/athlete.$slug.tsx`
3. `CERNE.md`
4. `BACKLOGER.md`

---

## 4. Estratégia de Validação

- `bun run typecheck` / TypeScript checks para validar a consistência dos tipos.
- `bun run lint` / `lint_applet` para validação de sintaxe e estilo.
- `compile_applet` para garantir compilação de produção bem-sucedida.
- Testes visuais e regressão: testar com `visual.logo_url` preenchido e com fallback sem logo.
