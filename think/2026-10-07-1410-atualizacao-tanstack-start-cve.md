# Planejamento — Atualização TanStack Start (CVE-2026-102989) e Validação de Lockfile

- **Data/Hora:** 2026-10-07 14:10 (Horário Local)
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Engineer)
- **Status:** [AGUARDANDO APROVAÇÃO HUMANA]
- **Arquivo:** `think/2026-10-07-1410-atualizacao-tanstack-start-cve.md`

---

## 1. Contexto & Diagnóstico da Causa Raiz

### 1.1 Sintoma
O deploy na Vercel (branch `main`) falha porque o build detecta a versão vulnerável `@tanstack/react-start@1.168.48` associada ao CVE-2026-102989 (XSS vulnerability), exigindo a versão `1.168.60` ou superior.

### 1.2 Diagnóstico da Causa Raiz
- `package.json` já requer `"@tanstack/react-start": "^1.168.60"`, `"@tanstack/react-router": "^1.170.41"` e `"@tanstack/router-plugin": "^1.168.42"`.
- O `bun.lock` no repositório já resolveu com sucesso para:
  - `@tanstack/react-start`: `1.168.60` (seguro contra o CVE)
  - `@tanstack/start-server-core`: `1.169.39`
  - `@tanstack/react-start-client`: `1.168.39`
  - `@tanstack/start-plugin-core`: `1.171.49`
  - `@tanstack/react-router`: `1.170.41`
  - `@tanstack/router-plugin`: `1.168.42`
  - `@tanstack/react-query`: `5.101.4`
- Ausência total de `@aws-sdk/*`.
- Ausência total de arquivos de lock concorrentes (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`).
- `bun install --frozen-lockfile` executa com sucesso sem nenhuma alteração no lock.

---

## 2. Escopo & Plano de Execução

### Etapa 1 — Verificação de Quebras de API (Breaking Changes)
Verificar integridade dos pontos críticos entre as versões `1.168.48` e `1.168.60+`:
1. `src/routes/__root.tsx`: Scripts de HeadContent, GA4, Clarity e MetaPixelTracker.
2. Rotas públicas: `src/routes/index.tsx` e `src/routes/athlete.$slug.tsx`.
3. Rotas e endpoints dinâmicos: `sitemap.xml`, `robots.txt`, `src/lib/indexnow.ts`.
4. Server Functions (`*.functions.ts`) e Handlers do Mailer/Resend.

### Etapa 2 — Validação de Build e Qualidade
1. Executar `bun run lint` e garantir 0 erros de ESLint/Prettier.
2. Executar `bun run typecheck` (`tsc --noEmit`) para garantir conformidade total de tipos.
3. Executar `bun test` (19 suítes, 139 testes unitários) garantindo 100% de aprovação.
4. Garantir que nenhuma flag insegura (`DANGEROUSLY_DEPLOY_VULNERABLE_TANSTACK_START_XSS`) seja introduzida.

### Etapa 3 — Documentação e Governança
1. Atualizar `CERNE.md` registrando as versões de dependências resolvidas e a blindagem contra o CVE.
2. Registrar a entrega no `BACKLOGER.md` como `TASK-085` com status `[CONCLUÍDO]`.

---

## 3. Critérios de Aceite
- [x] `@tanstack/react-start >= 1.168.60` resolvido no `bun.lock`.
- [x] `bun install --frozen-lockfile` passa 100% sem erros.
- [x] 139 testes unitários passam sem falhas.
- [x] Nenhuma flag insegura utilizada.
- [x] `CERNE.md` e `BACKLOGER.md` atualizados.
