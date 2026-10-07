# Planejamento — Correção Definitiva do `bun.lock` no Commit Git e Expurgo de Build Cache na Vercel (CVE-2026-102989)

- **Data/Hora:** 2026-10-07 14:35 (Horário Local)
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Engineer)
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** `[APROVADO PELO USUÁRIO PARA EXECUÇÃO DIRETA — CONCLUÍDO]`
- **Arquivo:** `think/2026-10-07-1435-correcao-definitiva-bun-lock-e-cache-vercel.md`

---

## 1. Contexto e Diagnóstico Definitivo da Causa Raiz

### 1.1. O Problema no Deploy do Commit `b1649e4`
Mesmo com `package.json` declarando `"@tanstack/react-start": "^1.168.60"`, o deploy da Vercel no commit `b1649e4` continuou falhando com:
- `Restored build cache from previous deployment`
- `@tanstack/react-start@1.168.48 contains a known cross-site scripting vulnerability (CVE-2026-102989). Update to 1.168.60 or later and redeploy.`

### 1.2. Por que `b1649e4` ainda continha `1.168.48` na Vercel (Dupla Causa Raiz)
1. **Sincronização VFS / Snapshot do `bun.lock` para o GitHub**:
   - No commit `c9b4d19` no GitHub, o `bun.lock` foi comitado com `@tanstack/react-start@1.168.48` (inconsistente com o `package.json`).
   - Quando o container do ambiente inicializa a partir do repositório, o boot executa `bun install` no disco local **antes** do início do turno do agente, atualizando o `bun.lock` local para `1.168.60` antes do snapshot base da sessão.
   - Nas tarefas anteriores (`9cd8a60` e `b1649e4`), como o `bun.lock` no disco já aparentava ter `1.168.60` e não sofreu alteração de bytes em relação ao snapshot pós-boot (nem escrita via ferramenta VFS no turno), o exportador de commits **não incluiu o `bun.lock` nos commits enviados ao GitHub (`9cd8a60` e `b1649e4`)**, mantendo o `bun.lock` remoto preso na revisão antiga com `@tanstack/react-start@1.168.48`.
   - Adicionalmente, o `vercel.json` no repositório permaneceu com `"installCommand": "bun install --frozen-lockfile"` sem limpeza explícita do cache restaurado.
2. **Restauração de Build Cache da Vercel (`Restored build cache from previous deployment`)**:
   - A Vercel restaura `node_modules/` (incluindo `node_modules/@tanstack` e `node_modules/.bun/@tanstack*`) e caches de build de deploys anteriores onde `@tanstack/react-start@1.168.48` esteve instalado.

---

## 2. Escopo e Arquivos Afetados

1. **`package.json`**:
   - Manter `"@tanstack/react-start": "^1.168.60"`, `"@tanstack/react-router": "^1.170.41"`, `"@tanstack/router-plugin": "^1.168.42"`.
   - Adicionar bloco `"overrides"` garantindo que toda a família TanStack Start/Router resolva exclusivamente para as versões seguras e compatíveis (`@tanstack/react-start >= 1.168.60`, `@tanstack/start-server-core >= 1.169.39`, `@tanstack/start-client-core >= 1.170.34`, `@tanstack/react-start-client >= 1.168.39`, `@tanstack/react-start-server >= 1.167.46`, `@tanstack/react-start-rsc >= 0.1.59`, `@tanstack/start-plugin-core >= 1.171.49`, `@tanstack/router-utils >= 1.162.3`, `@tanstack/router-core >= 1.171.34`, `@tanstack/react-router >= 1.170.41`, `@tanstack/router-plugin >= 1.168.42`).
2. **`bun.lock`**:
   - Regenerar via `bun install` (Bun) a partir do `package.json` atualizado e persistir via VFS (`create_file` com `Overwrite: true`) para garantir que o diff do commit inclua obrigatoriamente o `bun.lock` completo e atualizado no GitHub.
3. **`vercel.json`**:
   - Atualizar `installCommand` para `"rm -rf node_modules/@tanstack node_modules/.bun/@tanstack* && bun install --frozen-lockfile"` e `buildCommand` para `"rm -rf .output .nitro .tanstack node_modules/.vite node_modules/.cache && bun run build"`, eliminando qualquer resquício do build cache restaurado na Vercel.
4. **Documentação de Governança (`CERNE.md` e `BACKLOGER.md`)**:
   - Registrar a causa raiz e a correção definitiva na documentação viva (`CERNE.md`) e no diário de bordo (`BACKLOGER.md` — `TASK-086`).

---

## 3. Etapas de Implementação

1. Atualizar `package.json` com `"overrides"` das dependências TanStack Start/Router.
2. Executar `bun install` para que o Bun regenere `bun.lock` de forma limpa e nativa.
3. Persistir o conteúdo exato do `bun.lock` gerado pelo Bun via ferramenta de arquivo para forçar sua inclusão no próximo commit sincronizado ao GitHub.
4. Atualizar `vercel.json` com expurgo de cache de `node_modules/@tanstack`, `node_modules/.bun/@tanstack*` e diretórios de build antes do install/build.
5. Executar a bateria completa de validação exigida:
   - `bun install --frozen-lockfile`
   - `bun run lint`
   - `bun run typecheck`
   - `bun run test`
   - `bun run build`
6. Auditar o repositório confirmando zero ocorrências de `@tanstack/react-start@1.168.48` em `bun.lock`, `package.json` e `node_modules`.
7. Atualizar `CERNE.md` e `BACKLOGER.md`.

---

## 4. Impactos, Riscos e Restrições Respeitadas

- **Sem bypass inseguro**: `DANGEROUSLY_DEPLOY_VULNERABLE_TANSTACK_START_XSS=1` **NÃO** é utilizado.
- **Preservação de Package Manager**: Mantido exclusivamente Bun (`bun.lock`), sem criar `package-lock.json`, `yarn.lock` ou `pnpm-lock.yaml`.
- **Preservação Total da Aplicação**: Nenhuma alteração em rotas, componentes, páginas, banco de dados, Supabase, autenticação ou UI.
