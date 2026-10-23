# Execução aprovada — Recuperação da build Vercel e validação integral do Mailer

- **Data:** 2026-10-16 (America/Sao_Paulo)
- **Repositório:** `SrKain/dream-athletic-path`
- **Baseline:** `cf9f98baca4a63c93d8742992f36c877329f5f39`
- **Status:** `[APROVADO EXPLICITAMENTE PELO USUÁRIO EM 2026-10-16; EM EXECUÇÃO]`
- **Escopo:** corrigir deploy Bun/Vercel e auditar, estabilizar e comprovar orquestração do Mailer pelo navegador com progresso fiel, sem disparos reais para coaches.

## Diagnóstico

1. `package.json` declara `@lovable.dev/vite-tanstack-config:2.25.3` e `nitro:3.0.260603-beta`, divergindo das versões no manifesto do `bun.lock` (`2.13.1` e `^3.0.260610-beta`). Vercel falha em `bun install --frozen-lockfile` com Bun 1.3.14.
2. O Mailer possui orquestração via `setTimeout`/micro-lotes, `BroadcastChannel`, lease no Supabase, barra de progresso e métricas; ainda não foi validado em produção.
3. Riscos: aquisição de lease pode falhar sem bloquear, enfileiramento parcialmente gravado pode retornar sucesso, status `sent` não verifica erro de gravação, `Idempotency-Key` pode não ser passado como opção HTTP correta para Resend; UI pode apresentar estado inconsistente de aba concorrente e conclusão.
4. Migration 0025 existe, porém aplicação no Supabase não está comprovada. Migrations 0024/0025 expõem algumas funções `SECURITY DEFINER` amplamente a `authenticated`.

## Etapas aprovadas

### A — Preparação

- Partir da versão atual da `main`; criar branch isolada; preservar histórico Lovable, sem force-push.
- Respeitar `AGENTS.md`, `README.md`, `CERNE.md`, `BACKLOGER.md`, `UI&UX.md` e planos `think/`.

### B — Instalação e build

- Usar apenas Bun 1.3.14; regenerar `bun.lock` pelo próprio Bun (`bun install`), nunca editar manualmente o lockfile.
- Executar `bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`; corrigir regressões verificadas.
- Manter `--frozen-lockfile` e requisitos seguros do TanStack; usar GitHub Actions se o executor local não tiver Bun/registry.

### C — Estabilização Mailer

- Ajustar idempotência oficial do SDK Resend, proteção durável no banco, fail-closed do lease e escopo por campanha.
- Impedir retorno falso de sucesso em inserções parciais. Verificar resultados de persistência; proteger contra reenvio cego.
- Corrigir controle de concorrência/retomada no navegador, estados da UI, contadores reais, pausa/cancelamento/cooldown e conflitos entre abas.
- Criar migration incremental para permissões necessárias, sem editar migrations antigas aplicadas; preservar acesso de agência e serviço.

### D — Testes de aceitação

- Cobrir 1, 2, 10, 150, 151 e 300 destinatários, limites de 2 por micro-lote, 1s entre chamadas, pausa de 60s após bloco de 150, progresso, concorrência, reload, retries, erros de persistência, Resend 429 e supressões.
- Testar privilégios RPC por papel. Smoke test preview/staging apenas com destinatários autorizados; sem enviar para base real.

### E — Publicação e validação

- Atualizar `CERNE.md`, `BACKLOGER.md`, `think/`, elaborar PR, validar CI, merge/push `main` apenas após passar testes e prerequisitos de banco.
- Confirmar commit efetivamente publicado e estado `success` na Vercel. Não afirmar testes não realizados.
- Limitação: o executor local não tem acesso DNS a github.com nem Bun; utilizar GitHub conectado e GitHub Actions como executor.
- `git pull` apenas sincroniza checkout local; merge/push em `main` é o que costuma disparar Vercel.

## Critérios go/no-go

- [ ] `bun install --frozen-lockfile` verde com Bun 1.3.14.
- [ ] Typecheck, lint, testes e build verde.
- [ ] Mailer com segurança de lease, fila íntegra, idempotência e progresso correto verificados.
- [ ] Migration aplicada e privilégios testados, caso necessária.
- [ ] Vercel `success` no SHA atualizado em `main`.
- [ ] Sem envio real não autorizado.

## Aprovação

Aprovado explicitamente pelo usuário em 2026-10-16: "Pode executar, o plano foi aprovado." Implementação iniciada em branch isolada.
