# Planejamento: Favicon Dinâmico com Logotipo da Agência

**Data:** 2026-08-20 20:15  
**Status:** `[APROVADO]` (Aprovação concedida pelo usuário)  
**Solicitante:** Usuário Humano  
**Executor:** Antigravity AI  

---

## 1. Contexto & Causa Raiz

### 🐛 Contexto & Problema:
- O favicon da aplicação está definido de forma estática em `src/routes/__root.tsx`:
  `{ rel: "icon", href: "/favicon.ico", type: "image/x-icon" }`
  apontando para o arquivo físico `public/favicon.ico` (ícone padrão gerado pela Lovable).
- Quando a agência cadastra ou atualiza sua identidade visual (logotipo em `agency_visual_settings.logo_url`), a aba do navegador continua exibindo o ícone padrão.
- A rota raiz (`createRootRouteWithContext` em `src/routes/__root.tsx`) não possui um `loader` para consultar as configurações visuais do Supabase, impossibilitando a injeção do favicon dinâmico no `head()`.

---

## 2. Solução Proposta

### 🛠️ 1. `src/lib/athletes.functions.ts`
- Criar e exportar a função de leitura leve `getAgencyVisual`:
  ```ts
  export const getAgencyVisual = createServerFn({ method: "GET" }).handler(
    async (): Promise<AgencyVisualSettings | null> => {
      const { getPublicServerClient } = await import("@/lib/supabase/clients.server");
      const client = getPublicServerClient();
      if (!client) return null;
      const { data } = await client.from("agency_visual_settings").select("*").limit(1).maybeSingle();
      return (data ?? null) as AgencyVisualSettings | null;
    },
  );
  ```

### 🛠️ 2. `src/routes/__root.tsx`
- Adicionar `loader: () => getAgencyVisual()` na rota raiz.
- Atualizar a função `head: ({ loaderData }) => ({ ... })`:
  - Se `loaderData?.logo_url` existir:
    - Injetar `{ rel: "icon", href: loaderData.logo_url }`
    - Injetar `{ rel: "apple-touch-icon", href: loaderData.logo_url }`
  - Se não existir `logo_url`:
    - Manter o fallback padrão: `{ rel: "icon", href: "/favicon.ico", type: "image/x-icon" }`
- Como a rota raiz é herdada por todas as páginas (Home, Perfil do Atleta, Login, Admin, etc.), o favicon passa a ser consistente em toda a plataforma.

### 🛠️ 3. Governança e Documentação Viva
- Atualizar `think/2026-08-20-2000-correcao-logo-header-perfil-atleta.md` para `[CONCLUÍDO]`.
- Atualizar `CERNE.md` com a documentação do favicon dinâmico e loader na rota raiz.
- Registrar `TASK-035` (`[CONCLUÍDO]`) e nova `TASK-036` (`[CONCLUÍDO]`) em `BACKLOGER.md`.

---

## 3. Arquivos Envolvidos

1. `src/lib/athletes.functions.ts`
2. `src/routes/athlete.$slug.tsx`
3. `src/routes/__root.tsx`
4. `CERNE.md`
5. `BACKLOGER.md`
6. `think/2026-08-20-2000-correcao-logo-header-perfil-atleta.md`
7. `think/2026-08-20-2015-favicon-dinamico-logo-agencia.md`
