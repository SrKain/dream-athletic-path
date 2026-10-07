# Planejamento — Atualização TanStack Start (CVE-2026-102989) e Validação de Lockfile

- **Data/Hora:** 2026-10-07 14:20 (Horário Local)
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Engineer)
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** [APROVADO E CONCLUÍDO]
- **Arquivo:** `think/2026-10-07-1410-atualizacao-tanstack-start-cve.md`

---

## 1. Contexto & Diagnóstico da Causa Raiz

### 1.1 Sintoma
O deploy na Vercel (commit `9cd8a60`, branch `main`) falhou porque o build detectou `@tanstack/react-start@1.168.48`, que possui a vulnerabilidade XSS conhecida (**CVE-2026-102989**), exigindo a versão `1.168.60` ou superior.

### 1.2 Diagnóstico da Causa Raiz (Verificado no Repositório)
- `package.json` declara:
  - `"@tanstack/react-start": "^1.168.60"`
  - `"@tanstack/react-router": "^1.170.41"`
  - `"@tanstack/router-plugin": "^1.168.42"`
  - `"@tanstack/react-query": "^5.101.1"`
- O `bun.lock` no workspace já foi atualizado e resolve para toda a árvore segura e alinhada:
  - `@tanstack/react-start`: `1.168.60` (>= 1.168.60 — CVE corrigido)
  - `@tanstack/start-server-core`: `1.169.39`
  - `@tanstack/start-client-core`: `1.170.34`
  - `@tanstack/react-start-client`: `1.168.39`
  - `@tanstack/react-start-server`: `1.167.46`
  - `@tanstack/react-start-rsc`: `0.1.59`
  - `@tanstack/start-plugin-core`: `1.171.49`
  - `@tanstack/react-router`: `1.170.41`
  - `@tanstack/router-plugin`: `1.168.42`
  - `@tanstack/router-core`: `1.171.34` (exportando `makeSerovalPlugin` normalmente)
- Ausência total de `@aws-sdk/*` e de arquivos de lock concorrentes (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`).

---

## 2. Escopo e Arquivos Afetados

1. **`package.json` & `bun.lock`**: Confirmar e preservar o alinhamento de `@tanstack/react-start@^1.168.60`, `@tanstack/react-router@^1.170.41`, `@tanstack/router-plugin@^1.168.42` e `@tanstack/start-plugin-core@1.171.49`, garantindo que `bun install --frozen-lockfile` passe limpo sem alterações.
2. **Inspeção de Breaking Changes (1.168.48 → 1.168.60+)**:
   - `src/routes/__root.tsx`: `HeadContent`, `Scripts`, GA4 (`G-4D6DTG650F`), Microsoft Clarity (`y7zkn8qxno`), Meta Pixel (`1115203944400884`), `MetaPixelTracker` e tipagem de `ErrorComponent` (`error: unknown`).
   - Rotas públicas: `src/routes/index.tsx` e `src/routes/athlete.$slug.tsx`.
   - Sitemap/Robots e Server Handler: `src/server.ts` (`/sitemap.xml`, `/api/webhooks/resend`, `/api/cron/process-scheduled-emails`), `src/lib/sitemap.ts` e `public/robots.txt`.
   - Server Functions (`src/lib/*.functions.ts`, `src/lib/email/*.functions.ts`) e handlers do Mailer/Resend (`src/lib/email/*.server.ts`).
3. **Documentação Viva e Governança**:
   - `CERNE.md`: Documentar as versões exatas resolvidas da família TanStack e a blindagem contra o CVE-2026-102989.
   - `BACKLOGER.md`: Registrar a tarefa (`TASK-085`) e atualizar seu status após aprovação e validação final.

---

## 3. Etapas de Implementação

1. **Verificação de Lockfile com Bun**: Executar `bun install --frozen-lockfile` confirmando resolução limpa de `@tanstack/react-start@1.168.60` e pacotes irmãos.
2. **Checagem de Compatibilidade / Breaking Changes**: Auditar os contratos de `createServerFn`, `head`, `loader` e `server-entry` nos módulos listados no escopo; aplicar correção pontual apenas se houver quebra real.
3. **Validação Completa de Build e Testes**:
   - `bun run lint` (ESLint)
   - `bun run typecheck` (`tsc --noEmit`)
   - `bun run test` (Vitest — 19 suítes / 139 testes)
   - `bun run build` (`vite build` com preset Vercel/Nitro, verificando ausência do aviso de CVE-2026-102989)
4. **Atualização Documental**: Atualizar `CERNE.md` e `BACKLOGER.md` refletindo o estado final validado.

---

## 4. Impactos, Riscos e Alternativas Consideradas

- **Proibição de Bypass Inseguro**: Em conformidade estrita com `AGENTS.md` (Regra 6) e com o pedido do usuário, **NÃO** será utilizada a variável `DANGEROUSLY_DEPLOY_VULNERABLE_TANSTACK_START_XSS=1` em nenhum arquivo ou configuração.
- **Preservação do `bun.lock`**: Mantido exclusivamente via Bun, sem uso de npm/yarn/pnpm.

---

## 5. Estratégia de Validação (Critérios de Aceite)

- [x] `bun.lock` resolve `@tanstack/react-start >= 1.168.60` (`1.168.60`).
- [x] `bun install --frozen-lockfile` passa sem erro.
- [x] `bun run typecheck`, `bun run lint`, `bun run test` e `bun run build` passam limpos e sem aviso de vulnerabilidade CVE-2026-102989.
- [x] Rotas públicas (Home, Perfil do Atleta), Admin e Mailer íntegros.
- [x] `CERNE.md` e `BACKLOGER.md` atualizados.

---

## 6. Status da Aprovação Humana

- **Status:** `[AGUARDANDO APROVAÇÃO HUMANA EXPLÍCITA]`

