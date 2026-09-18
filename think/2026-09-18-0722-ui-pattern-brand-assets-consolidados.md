# Planejamento Técnico — UI Pattern & Brand Assets Consolidados (TASK-071)

**Data:** 2026-09-18 07:22  
**Status:** [PROPOSTO - AGUARDANDO APROVAÇÃO HUMANA]  
**Autor:** Antigravity AI / Gemini Coding Agent  
**Contexto:** Pacote único e consolidado de 4 correções de UI Pattern, Identidade Visual e Brand Assets para a plataforma Go Team Go.

---

## 1. Visão Geral e Objetivos

Este plano cobre quatro correções essenciais em um bloco único e indivisível de entrega:

1. **ITEM 1 — Refatoração de `src/routes/feedback.tsx`:**
   - Eliminar paleta escura hardcoded genérica (`#0b0b0c`, `zinc-800/900`, `amber-500`).
   - Aplicar os tokens oficiais do Design System (`--background`, `--foreground`, `--primary` #f69e00, `--secondary` #084323, `.glass-panel`, `.liquid-button`, `.eyebrow`, fontes Display e Sans).
   - Preservar integralmente a lógica de submissão do sinal de interesse de 6 meses e os parâmetros de busca (`email`, `coachId`, `athleteId`, `position`).

2. **ITEM 2 — Refatoração de `src/routes/unsubscribe.tsx`:**
   - Eliminar a paleta escura hardcoded antiga.
   - Alinhar com os tokens visuais oficiais e Quiet Luxury do projeto.
   - Preservar integralmente a lógica e estrutura de 2 níveis de descadastro (Pausa de 6 meses `temporary_6m` vs. Descadastro permanente `permanent`).

3. **ITEM 3 — Correção de Logo Quebrada no Header + Extração de Componente Único:**
   - **Causa Raiz:** `getOptimizedImageUrl()` em `src/lib/image-transform.ts` reescreve URLs para `/storage/v1/render/image/public/...`, endpoint do Supabase que não suporta arquivos SVG de origem. Ao salvar um logo SVG em `admin/visual.tsx`, a imagem quebrava no header.
   - **Solução:**
     - Atualizar `getOptimizedImageUrl()` para identificar URLs SVG (extensão `.svg` / MIME) e retornar a URL pública original sem passar pelo endpoint de transformação.
     - Atualizar `src/lib/uploads.ts` para adicionar o tipo de upload `branding` com suporte a `image/svg+xml`.
     - Extrair o cabeçalho público compartilhado para um componente único (`src/components/public-header.tsx`), eliminando duplicação entre `src/routes/index.tsx` e `src/routes/athlete.$slug.tsx`.

4. **ITEM 4 — Correção do Favicon e Fallback Oficial:**
   - **Diagnóstico da Causa Raiz:**
     - *(a)* No estado inicial ou quando a agência ainda não cadastrou uma logo personalizada, `agency_visual_settings.logo_url` é nulo/vazio, fazendo `src/routes/__root.tsx` recorrer ao fallback `/favicon.ico`.
     - *(b)* O arquivo físico `public/favicon.ico` era o ícone residual padrão do Lovable.
   - **Solução:**
     - Criar `public/favicon.svg` e substituir `public/favicon.ico` pelo ícone e monograma oficial da Go Team Go (Verde Escuro `#032812` + Laranja Dourado `#f69e00`).
     - Atualizar `src/routes/__root.tsx` para referenciar o favicon SVG e o favicon ICO atualizado, mantendo a sobrescrita dinâmica quando `logo_url` estiver preenchido.

---

## 2. Arquivos Envolvidos e Modificações

| Arquivo | Ação | Descrição |
| :--- | :--- | :--- |
| `src/routes/feedback.tsx` | Modificação | Refatoração visual com tokens oficiais, `.glass-panel`, `.eyebrow`, `.liquid-button`. |
| `src/routes/unsubscribe.tsx` | Modificação | Refatoração visual com tokens oficiais, cards de seleção em 2 níveis e botões contextuais. |
| `src/lib/image-transform.ts` | Modificação | Bypass do render/image quando a URL for SVG (`.svg`). |
| `src/lib/image-transform.test.ts` | Modificação | Novos testes unitários validando preservação de URLs SVG. |
| `src/lib/uploads.ts` | Modificação | Adição de `branding` em `uploadRules` com suporte a `image/svg+xml`. |
| `src/lib/uploads.test.ts` | Modificação | Testes unitários para validação de `branding` e SVG. |
| `src/routes/_authenticated/admin/visual.tsx` | Modificação | Uso de `validateUpload("branding", file)`. |
| `src/components/public-header.tsx` | Criação | Componente unificado de header público com logo dinâmico e fallback tipográfico. |
| `src/routes/index.tsx` | Modificação | Utilização do `PublicHeader`. |
| `src/routes/athlete.$slug.tsx` | Modificação | Utilização do `PublicHeader`. |
| `src/routes/__root.tsx` | Modificação | Inclusão de `favicon.svg` e vínculo correto do favicon estático e dinâmico. |
| `public/favicon.svg` | Criação | Vetor oficial do monograma Go Team Go. |
| `public/favicon.ico` | Modificação | Favicon estático com a marca Go Team Go. |
| `CERNE.md` | Modificação | Documentação da entrega TASK-071. |
| `BACKLOGER.md` | Modificação | Registro da TASK-071 concluída com os 4 itens. |

---

## 3. Detalhamento da Implementação

### 3.1 `src/lib/image-transform.ts`
```ts
function isSvgUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith(".svg");
  } catch {
    return url.toLowerCase().includes(".svg");
  }
}

export function getOptimizedImageUrl(
  originalUrl: string | null | undefined,
  options: ImageTransformOptions = {},
): string {
  if (!originalUrl) return "";
  if (isSvgUrl(originalUrl)) return originalUrl;
  // ... lógica existente de render/image ...
}
```

### 3.2 `src/components/public-header.tsx`
Criação de um header padronizado, acessível e com estética Quiet Luxury:
- Logo dinâmico da agência via `getAgencyLogoImage(visual?.logo_url)`.
- Fallback em tipografia display ("Go Team Go") caso não haja logo cadastrado.
- Suporte a slots de ações (ex: botão de retorno ao catálogo, links de contato).
- Efeito backdrop-blur e sticky top-0.

### 3.3 `src/routes/feedback.tsx` e `src/routes/unsubscribe.tsx`
- Layout centralizado com `bg-background text-foreground`.
- Painel `glass-panel` com cantos arredondados, bordas sutis `border-border/70`.
- Título com `font-display`, subtítulos refinados e tags `.eyebrow`.
- Cards de opção com estados ativo/inativo destacados em `--primary` e `--destructive`.
- Botões estilizados com `.liquid-button` e transições suaves.

### 3.4 Favicons (`public/favicon.svg` & `public/favicon.ico`)
- Emblema com fundo `#032812`, bordas arredondadas e monograma estilizado "GTG" em `#f69e00`.
- Injeção em `__root.tsx`:
  - `{ rel: "icon", href: logoUrl || "/favicon.svg", type: logoUrl?.endsWith(".svg") ? "image/svg+xml" : undefined }`
  - `{ rel: "alternate icon", href: "/favicon.ico", type: "image/x-icon" }`

---

## 4. Estratégia de Validação

1. **Testes Unitários:** Executar `bun test` garantindo que todos os 109+ testes passem, incluindo os novos testes de SVG e validação de uploads.
2. **ESLint & Prettier:** Executar `bun run lint` e `bunx prettier --check` para garantir zero erros de formatação ou sintaxe.
3. **Build de Produção:** Executar `compile_applet` para certificar integridade completa do bundle.
4. **Verificação Visual:**
   - Feedback (`/feedback`) com design system oficial.
   - Unsubscribe (`/unsubscribe`) com design system oficial.
   - Header com logo SVG funcional no catálogo e na página do atleta.
   - Favicon com a marca Go Team Go.

---

## 5. Status da Aprovação Humana

Plano registrado na pasta `think/`. Aguardando aprovação explícita do usuário para início da execução conjunta dos 4 itens.
