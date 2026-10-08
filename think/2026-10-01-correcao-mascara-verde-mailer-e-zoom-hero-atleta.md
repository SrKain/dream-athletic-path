# Planejamento: Correção da Máscara Verde no Hero do Mailer e Zoom Excessivo no Hero do Perfil do Atleta

**Data:** 2026-10-01  
**Autor:** Antigravity AI / Gemini Coding Agent  
**Status:** `[AGUARDANDO APROVAÇÃO HUMANA]`  
**Solicitante:** Kauan / Usuário Humano

---

## 1. Contexto e Diagnóstico das Causas Raízes

### 1.1 Bug 1: Mailer — Ausência da Máscara Verde sobre a Imagem de Background do Hero

- **Arquivo Responsável:** `src/lib/email/email-layout.ts` (função `renderEmailHero`).
- **Causa Raiz:** O elemento `<td>` do Hero de e-mail definia a imagem de fundo via `background-image:url('${heroBg}')`, mas não continha nenhuma camada intermediária ou gradiente de máscara verde (`rgba` / `linear-gradient`). Com isso, a imagem original aparecia 100% nua e direta sob os textos brancos e dourados, sem a atmosfera verde institucional escura (`#032812` / `#05301a`) presente na Home e na identidade visual da agência.
- **Hierarquia Visual Desejada:**
  ```text
  BACKGROUND IMAGE (heroBg)
         ↓
  GREEN MASK / OVERLAY (Degradê verde institucional #032812 → #05301a → #084323 translúcido)
         ↓
  TEXT + HERO CONTENT (Ano dourado, título branco, manuscrito, subtítulo)
  ```

### 1.2 Bug 2: Portfólio — Zoom Excessivo no Retrato do Hero da Página do Atleta (`/athlete/$slug`)

- **Arquivos Responsáveis:** `src/routes/athlete.$slug.tsx` (linhas 308-324) e `src/lib/image-transform.ts` (função `getAthleteHeroImage`).
- **Causa Raiz:**
  1. No módulo de otimização de imagens (`src/lib/image-transform.ts`), a função `getAthleteHeroImage` fornecia apenas `{ width: 720, quality: 78 }` sem parâmetros de `height` e `resize: "cover"`. Quando a URL de storage do Supabase é transformada (`/render/image/public/...`), imagens no formato landscape/wide (como 1920x1080) eram reduzidas para 720x405 mantendo a proporção original.
  2. No componente de perfil (`src/routes/athlete.$slug.tsx`), o container possuía a classe `aspect-[4/5]` (formato vertical estreito) com `<img className="h-full w-full object-cover object-top" />`. Ao forçar uma imagem 720x405 a cobrir um container vertical 4:5, o navegador aplicava um zoom/escala artificial de mais de 220%, cortando laterais e aproximando excessivamente o rosto ou perdendo o enquadramento do atleta.
  3. No Catálogo/Home (`src/components/athlete-video-card-media.tsx`), o enquadramento funciona perfeitamente porque utiliza a proporção harmônica `aspect-[3/4]` combinada com o preset `getAthleteCardImage` (`width: 400, height: 533, resize: "cover"`).

---

## 2. Escopo e Arquivos Afetados

| Arquivo                           | Natureza da Alteração           | Descrição Cirúrgica                                                                                                                                                                                                                                                                                                                                                                 |
| :-------------------------------- | :------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/email/email-layout.ts`   | Correção Visual (Mailer)        | Adicionar a máscara verde institucional em degradê sobre o background do hero em `renderEmailHero`, com suporte a múltiplos backgrounds CSS (`linear-gradient(to right, rgba(3,40,18,0.94) 0%, rgba(5,48,26,0.88) 55%, rgba(8,67,35,0.65) 100%), url(...)`) e camada interna com fallback `background-color: rgba(...)`, preservando VML para Outlook e toda a estrutura de textos. |
| `src/routes/athlete.$slug.tsx`    | Correção Visual (Perfil Atleta) | Ajustar a proporção do container do retrato no hero para `aspect-[3/4]` (idêntico ao padrão funcional da Home) e manter `object-cover object-top`, eliminando o super zoom artificial.                                                                                                                                                                                              |
| `src/lib/image-transform.ts`      | Otimização de Preset            | Atualizar o preset `getAthleteHeroImage` para `{ width: 600, height: 800, resize: "cover", quality: 85 }` (proporção padrão 3:4 de alta definição), garantindo enquadramento fotográfico natural e consistente.                                                                                                                                                                     |
| `src/lib/image-transform.test.ts` | Testes Unitários                | Atualizar o teste unitário de `getAthleteHeroImage` para cobrir os parâmetros `width=600`, `height=800`, `resize=cover`, `quality=85`.                                                                                                                                                                                                                                              |

---

## 3. Detalhamento Técnico das Correções

### 3.1 Mailer (`src/lib/email/email-layout.ts`)

- Configurar o `<td>` com background composto:
  ```html
  <td
    bgcolor="${EMAIL_COLORS.darkGreenDeep}"
    background="${heroBg}"
    valign="top"
    style="background-color:${EMAIL_COLORS.darkGreenDeep};background-image:linear-gradient(to right, rgba(3, 40, 18, 0.94) 0%, rgba(5, 48, 26, 0.88) 55%, rgba(8, 67, 35, 0.65) 100%), url('${heroBg}');background-size:cover;background-position:center right;background-repeat:no-repeat;padding:0;"
  ></td>
  ```
- Estruturar a tabela interna com padding e degradê/fallback verde esmeralda:
  ```html
  <table
    role="presentation"
    width="100%"
    border="0"
    cellspacing="0"
    cellpadding="0"
    style="background:linear-gradient(to right, rgba(3, 40, 18, 0.94) 0%, rgba(5, 48, 26, 0.88) 55%, rgba(8, 67, 35, 0.65) 100%);background-color:rgba(3, 40, 18, 0.86);padding:26px 28px 24px 28px;"
  ></table>
  ```
- Preservar o bloco condicional VML `<!--[if gte mso 9]>` para renderização perfeita no Microsoft Outlook desktop.
- Manter inalterados todos os textos, tipografia, manuscritos, dimensões e responsividade mobile.

### 3.2 Perfil Público do Atleta (`src/routes/athlete.$slug.tsx`)

- Alterar a classe do container do retrato:
  ```tsx
  {/* Retrato do Atleta em Proporção Natural 3:4 */}
  <div className="flex justify-center sm:justify-start">
    <div className="relative aspect-[3/4] w-52 sm:w-60 md:w-72 shrink-0 overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/15">
      <img
        src={getAthleteHeroImage(photoUrl)}
        alt={`${athlete.full_name} — ${positionLabel ?? "Volleyball"} — Go Team Go Agency headshot`}
        className="h-full w-full object-cover object-top"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
      ...
  ```

### 3.3 Preset de Transformação (`src/lib/image-transform.ts`)

- Definir:
  ```typescript
  export function getAthleteHeroImage(url: string | null | undefined): string {
    return getOptimizedImageUrl(url, {
      width: 600,
      height: 800,
      resize: "cover",
      quality: 85,
    });
  }
  ```

---

## 4. Estratégia de Validação

1. **Validação Automatizada de Código**:
   - `bun run typecheck` (verificação de tipagem TypeScript).
   - `bun run lint` (conformidade ESLint).
   - `bun run test` (todos os testes unitários passando, incluindo `image-transform.test.ts` e `email` suites).
   - `bun run build` / `compile_applet` (compilação de produção com sucesso).
2. **Inspeção Visual do Mailer**:
   - Executar `scripts/preview-emails.ts` e verificar os 3 previews gerados (`preview-single.html`, `preview-multi.html`, `preview-catalog.html`).
   - Confirmar visualmente a presença da máscara verde translúcida cobrindo a imagem de fundo e realçando a legibilidade dos títulos em branco e dourado.
3. **Inspeção Visual do Perfil do Atleta**:
   - Acessar `/athlete/:slug` e confirmar que a fotografia é apresentada de forma natural e proporcional, sem zoom excessivo ou cortes indevidos do rosto.
   - Confirmar que a Home (`/`) e os cards do catálogo permanecem 100% inalterados.

---

## 5. Garantia de Restrições

- [x] Zero alterações no Supabase, banco de dados ou migrations.
- [x] Zero alterações no fluxo de envio, Resend ou dados dos e-mails.
- [x] Zero alterações no código ou layout da Home/Catálogo.
- [x] Zero inclusão de novas dependências.
- [x] Correção 100% cirúrgica na camada de apresentação.
