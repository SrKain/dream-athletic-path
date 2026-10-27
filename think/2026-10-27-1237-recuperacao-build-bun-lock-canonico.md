# Plano de Recuperação da Build Vercel — Restauração do bun.lock Canônico (11e32ea)

- **Data / Hora:** 2026-10-27, ~12:37 (America/Sao_Paulo / UTC-3).
- **Repositório:** `SrKain/dream-athletic-path`, branch `main`.
- **Contexto:** A build da Vercel quebrou no commit `67551be` com o erro:
  `"error: lockfile had changes, but lockfile is frozen" (bun install --frozen-lockfile, Bun 1.3.14)`.
- **Causa Comprovada:** O commit `67551be` comitou um `bun.lock` divergente (blob `c5cb7bd`):
  - `@lovable.dev/vite-tanstack-config`: package.json = `2.25.3`, bun.lock = `2.13.1`
  - `nitro`: package.json = `3.0.260603-beta`, bun.lock = `^3.0.260610-beta`
  O `bun.lock` canônico e válido é o blob `11e32ea0199fd8ea03742194d7e92136aa0ed513` (presente nos commits `8651da0` e `3a90ba2`).

## Escopo Confirmado pelo Usuário
- **Arquivos a incluir no commit final:**
  1. `bun.lock` (restaurado byte a byte ao blob `11e32ea0199fd8ea03742194d7e92136aa0ed513` do commit `8651da0`)
  2. `AGENTS.md` (correção de indentação da última linha da Regra 7 + reforço explícito proibindo agentes de tocarem no `bun.lock` e `package.json`)
  3. `src/lib/lockfile-sync.test.ts` (endurecimento com asserções estritas das versões exatas de `@lovable.dev/vite-tanstack-config` e `nitro`)
  4. `BACKLOGER.md` (registro formal da TASK de recuperação de build com as saídas reais dos comandos)
  5. `CERNE.md` (atualização da documentação viva com o histórico da recuperação)

## Etapas de Execução

1. **Restauração Estrita do `bun.lock` Canônico:**
   - Obter o blob canônico `11e32ea0199fd8ea03742194d7e92136aa0ed513` idêntico ao commit `8651da0`.
   - Garantir que `git hash-object bun.lock` retorne exatamente `11e32ea0199fd8ea03742194d7e92136aa0ed513`.
   - Não rodar `bun install` sem `--frozen-lockfile`, não rodar `bun update` nem editar `package.json`.

2. **Ajuste e Reforço do `AGENTS.md`:**
   - Corrigir a indentação indevida da frase final da regra 7 ("Se qualquer etapa falhar e não puder ser resolvida sem violar estas regras, PARE e reporte ao humano em vez de entregar código quebrado.").
   - Adicionar o reforço mandatário na regra 7:
     `"Agentes de IA NUNCA modificam bun.lock nem package.json. Se uma tarefa exigir mudança de dependência, PARE e peça ao humano. Antes de todo commit, rode git diff --name-only e remova bun.lock/package.json do staging se aparecerem."`

3. **Endurecimento do Teste `src/lib/lockfile-sync.test.ts`:**
   - Adicionar caso de teste explícito comparando as versões exatas de `@lovable.dev/vite-tanstack-config` (`2.25.3`) e `nitro` (`3.0.260603-beta`) entre `package.json` e `bun.lock`.
   - Manter 100% das asserções e testes existentes sem relaxamentos.

4. **Portão Anti-Build-Quebrada (Validação Real):**
   - Executar `bun run test src/lib/lockfile-sync.test.ts` (deve passar verde).
   - Executar `bun run typecheck` (`tsc --noEmit`, 0 erros).
   - Executar `bun run lint` (0 erros).
   - Executar `bun run test` (todos os testes verdes).
   - Executar `compile_applet` / verificação de build.

5. **Documentação Viva e Registro:**
   - Registrar a nova TASK de recuperação de build no `BACKLOGER.md` com as saídas reais de validação.
   - Atualizar `CERNE.md` com os detalhes da intervenção.
