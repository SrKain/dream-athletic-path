# Planejamento — Desacoplamento do Script Standalone IndexNow (`scripts/indexnow-bulk.ts`)

- **Data/Hora:** 2026-09-02T10:10:00-07:00
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Antigravity / Gemini Agent
- **Referência:** Follow-up da entrega original do IndexNow (`think/2026-09-02-0900-implementacao-indexnow.md` e `TASK-053` no `BACKLOGER.md`)
- **Status do Plano:** [CONCLUÍDO] — Validado via `npx tsx scripts/indexnow-bulk.ts` com retorno HTTP 200/202 da API IndexNow.

---

## 1. Contexto & Diagnóstico

No ambiente GitHub Codespace / terminal independente onde o runtime do TanStack Start e o `bun` não estão presentes, a execução standalone via `npx tsx scripts/indexnow-bulk.ts` falha com:

```
ERR_MODULE_NOT_FOUND: Cannot find package '@tanstack/react-start'
```

### Causa Raiz

O script `scripts/indexnow-bulk.ts` importava a função `submitToIndexNow` de `src/lib/indexnow.ts`. Como `src/lib/indexnow.ts` importa utilitários do `@tanstack/react-start` (como `createServerFn`), a resolução de módulos do Node via `npx tsx` não consegue resolver esses pacotes fora do contexto de compilação da aplicação web.

---

## 2. Escopo & Diretrizes da Solução

O objetivo é reescrever `scripts/indexnow-bulk.ts` para ser **100% autocontido (standalone)**, sem depender de nenhum arquivo de `src/` ou do TanStack Start.

### O que SERÁ feito:

1. **Constantes Locais**:
   - `INDEXNOW_KEY = '1675dcaaacd2469b9461671a29b307e0'`
   - `HOST = 'portfolio.goteamgoagency.com'`
   - `KEY_LOCATION = 'https://portfolio.goteamgoagency.com/1675dcaaacd2469b9461671a29b307e0.txt'`
   - `INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'`
2. **Função de Submissão HTTP Autônoma**:
   - Função local `submitToIndexNow(urlList: string[])` realizando requisição `POST` direta via `fetch` nativo para `https://api.indexnow.org/indexnow`.
   - Headers: `Content-Type: application/json; charset=utf-8`, `User-Agent: IndexNow-Bulk-Standalone/1.0`.
   - Payload JSON com `host`, `key`, `keyLocation` e `urlList`.
3. **Extração Dinâmica de URLs**:
   - `fetch` em `https://portfolio.goteamgoagency.com/sitemap.xml`.
   - Extração de todas as tags `<loc>` via RegExp.
   - Deduplicação e sanitização de URLs.
   - Fallback de segurança para `https://portfolio.goteamgoagency.com/` se nenhuma URL for encontrada.
4. **Logs Detalhados**:
   - Exibição de cada URL identificada, total de URLs e o código de status HTTP retornado pela API do IndexNow (ex.: 200/202).
5. **Preservação de Integridade**:
   - **NÃO alterar** `src/lib/indexnow.ts`, nem os handlers administrativos, nem o sitemap — que funcionam perfeitamente dentro do runtime do app.
6. **Validação**:
   - Executar `npx tsx scripts/indexnow-bulk.ts`.
   - Registrar no `BACKLOGER.md` como ajuste/follow-up da entrega original do IndexNow (`TASK-053`).

---

## 3. Plano de Testes & Validação

1. Executar `npx tsx scripts/indexnow-bulk.ts` e verificar a saída de sucesso e status HTTP retornado pelo endpoint do IndexNow.
2. Executar `vitest run` para garantir que a suíte existente de 80 testes continue com 100% de aprovação.
3. Executar `npm run lint` para validação de estilo.
4. Executar `npm run build` para garantir a integridade do app.

---

## 4. Solicitação de Aprovação Prévia

Conforme o item 2 de `AGENTS.md`, o plano está devidamente registrado na pasta `think/`. Nenhuma alteração em `scripts/indexnow-bulk.ts` ou arquivos de código foi realizada ainda. Aguardo sua aprovação explícita para aplicar as alterações e executar a validação.
