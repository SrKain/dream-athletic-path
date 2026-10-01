# Plano de Solução: Correção da Logo do Header Público e Padronização do Componente de Marca

- **Data**: 2026-09-28 14:45
- **Status**: Em Análise / Aguardando Aprovação Humana
- **Autor / Agente**: Antigravity AI
- **Solicitante**: Kauan

---

## 1. Diagnóstico Obrigatório (Etapa 0 — Evidências Reais)

### 1.1 Consulta ao Banco de Dados e URLs em Produção

- **Valor real de `agency_visual_settings.logo_url` em produção**:  
  `https://ugxoweynkdzzfdbbppnv.supabase.co/storage/v1/object/public/athlete-media/agency/branding/logo-1788972833803.png`
- **URL transformada gerada por `getAgencyLogoImage()`**:  
  `https://ugxoweynkdzzfdbbppnv.supabase.co/storage/v1/render/image/public/athlete-media/agency/branding/logo-1788972833803.png?width=260&quality=85`

### 1.2 Inspeção via `curl -sI` (Cabeçalhos HTTP)

- **URL Original (`object/public`)**:
  - Status: `HTTP/2 200`
  - `content-type`: `image/png`
  - `content-length`: `275270` bytes (268.8 KB)
  - `cache-control`: `no-cache` / configurável via storage
- **URL Transformada (`render/image?width=260&quality=85`)**:
  - Status: `HTTP/2 200`
  - `content-type`: `image/png`
  - `content-length`: `23577` bytes (23.0 KB)
  - `x-transformations`: `width:260,resizing_type:fill,quality:85`
  - `cache-control`: `max-age=31536000`

### 1.3 Formato, Dimensões e Peso do Arquivo

- **Formato real**: PNG (8-bit RGBA, non-interlaced).
- **Dimensões originais**: `2172 x 724` px (proporção **3:1 horizontal**).
- **Dimensões da imagem transformada (`?width=260&quality=85`)**: `260 x 724` px (proporção **0.359:1 vertical**).
- **Peso original**: 268.8 KB (inferior ao limite de 300KB).
- **Extensão**: `.png` (não é SVG).

### 1.4 Causa Raiz Confirmada

- **Causa Confirmada**: A transformação do Supabase Storage (`render/image`), quando recebe apenas `width=260` sem `resize="contain"`, aplica por padrão `resizing_type: fill` (ou preserva a altura original de 724px).
- Isso gerou uma imagem deformada de `260 x 724` px (uma tira vertical).
- No navegador, as tags `<img>` públicas estavam configuradas com `className="h-8 md:h-10 w-auto object-contain"`. Ao forçar a altura em 32px (`h-8`), a largura calculada pelo navegador ficou em apenas `32px * (260/724) = 11.49px` de largura!
- Uma imagem de 11px de largura ficou praticamente invisível, cortando o alt text e parecendo um ícone quebrado.
- No admin (`/admin/visual`), o preview usa a URL original crua (`2172 x 724`), que com `h-10 w-auto` renderiza perfeitamente com 120px de largura.
- **Teste com `resize=contain` e `width=400`**:  
  URL `.../logo-1788972833803.png?width=400&resize=contain&quality=85` gerou com sucesso `400 x 133` px (proporção 3:1 exata) e peso de apenas ~35KB.
- **Ausência de Fallback**: Caso ocorra qualquer erro de rede ou renderização da URL transformada, a tag `<img>` anterior não possuía recuperação, vazando texto alt em container colapsado.

### 1.5 Validação de Migrations

- As tabelas e colunas envolvidas (`agency_visual_settings.logo_url`) estão consolidadas nas migrations 0009 e 0012. Nenhuma migration adicional de banco é necessária.

---

## 2. Escopo da Solução e Arquitetura

### 2.1 Criação do Componente Unificado `AgencyLogo` (`src/components/agency-logo.tsx`)

Criar um componente com tratamento de ciclo de vida e fallback em cascata:

- **Estados de Fallback**:
  1. `transformed`: Tenta carregar a URL otimizada (`getAgencyLogoImage(logoUrl)`). Se o arquivo for SVG, a URL original já é retornada de imediato.
  2. `original`: Se a URL transformada disparar `onError`, troca instantaneamente o `src` para a URL original crua (`logoUrl`).
  3. `text`: Se a URL original também disparar `onError` (ou se `logoUrl` for nula/vazia), renderiza o texto tipográfico `"Go Team Go"`.
- **Props**:
  - `logoUrl?: string | null`
  - `variant?: "header" | "footer"` (ou classes customizadas via `className`)
  - `className?: string`
  - `alt?: string` (padrão: `"Go Team Go Agency"`)
- **Estilos e Dimensões Fixas**:
  - Header: `h-8 md:h-10 w-auto max-w-[200px] object-contain shrink-0`
  - Footer: `h-7 w-auto max-w-[180px] object-contain shrink-0`
  - `decoding="async"`
  - Contraste validado sobre `bg-background/90` e `bg-background/60`.

### 2.2 Ajuste em `getAgencyLogoImage` e Utilitários (`src/lib/image-transform.ts`)

- Atualizar o preset `getAgencyLogoImage`:
  ```ts
  export function getAgencyLogoImage(url: string | null | undefined): string {
    return getOptimizedImageUrl(url, {
      width: 400,
      resize: "contain",
      quality: 85,
    });
  }
  ```
- Aprimorar `isSvgUrl` para detectar arquivos SVG mesmo que haja query params ou encoding inconsistente.

### 2.3 Normalização de Extensões no Upload (`src/routes/_authenticated/admin/visual.tsx`)

- Ao fazer upload de branding/logo ou hero, mapear o MIME type real do arquivo (`file.type`):
  - `image/svg+xml` → `.svg`
  - `image/png` → `.png`
  - `image/jpeg` / `image/jpg` → `.jpg`
  - `image/webp` → `.webp`
  - fallback para `file.name.split(".").pop()`.

### 2.4 Consolidação nos Consumidores

Substituir as implementações fragmentadas de `<img>` pelo novo `<AgencyLogo />` em:

1. `src/components/public-header.tsx`
2. `src/routes/index.tsx` (Footer)
3. `src/routes/athlete.$slug.tsx` (Footer)

---

## 3. Estratégia de Testes e Validação

1. **Testes Unitários do Componente (`src/components/agency-logo.test.tsx`)**:
   - Renderização com logo válida (renderiza URL transformada).
   - Simulação de `onError` na URL transformada → ativa URL original crua.
   - Simulação de `onError` secundário na URL crua → ativa fallback de texto `"Go Team Go"`.
   - Renderização sem logo (`null`/`undefined`/`""`) → exibe diretamente o texto.
2. **Testes Unitários de Transformação (`src/lib/image-transform.test.ts`)**:
   - Validação de `getAgencyLogoImage` gerando `width=400` e `resize=contain`.
   - Validação de preservação de SVGs (sem `render/image`).
   - Validação de URLs externas (preservadas sem alteração).
3. **Validação do Sistema**:
   - Execução de `npm run test` (todos os testes passando).
   - Execução de `npm run lint` (zero erros).
   - Execução de `compile_applet` (build de produção limpo).

---

## 4. Governança e Documentação

- Registro da nova tarefa em `BACKLOGER.md` (`TASK-046`).
- Atualização detalhada no `CERNE.md` registrando o novo componente `AgencyLogo`, as melhorias no `image-transform.ts` e na tela de upload de identidade visual.
