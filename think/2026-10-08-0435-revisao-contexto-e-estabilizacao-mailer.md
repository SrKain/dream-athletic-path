# Planejamento — Revisão de Contexto e Estabilização dos Tipos/Testes do Mailer (Pós TASK-087)

- **Data/Hora:** 2026-10-08 04:35 Local
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Engineer)
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** `[APROVADO PELO USUÁRIO E CONCLUÍDO COM SUCESSO]`
- **Arquivo:** `think/2026-10-08-0435-revisao-contexto-e-estabilizacao-mailer.md`

---

## 1. Contexto e Revisão de Governança

Leitura integral e assimilação concluídas dos seguintes documentos obrigatórios:

1. **`README.md`**: Plataforma SaaS para Agências de Intercâmbio Esportivo (Go Team Go / Sport Scout Hub), stack TanStack Start + Vite + TypeScript, package manager exclusivo Bun, Supabase externo, Resend oficial, arquitetura em camadas e regras de segurança.
2. **`CERNE.md`**: Documentação viva com mapeamento de rotas, componentes, schemas de banco e serviços de e-mail/webhook.
3. **`BACKLOGER.md`**: Histórico completo de tarefas até TASK-087 (Overhaul de métricas de abertura e clique do Mailer) e registro da TASK-088.
4. **`UI&UX.md`**: Diretrizes de Design System, filosofia mobile-first, paleta OKLCH, tipografia Space Grotesk / Inter e componentes acessíveis.
5. **Planos em `think/`**: Histórico preservado, com destaque para a migração e estabilização recente de métricas e lockfile da Vercel.

---

## 2. Diagnóstico Técnico Levantado na Revisão

Durante a execução da verificação de integridade (`typecheck` e testes unitários), foram identificadas as seguintes pendências decorrentes da implementação recente da TASK-087:

1. **`src/lib/email/resend-webhook.server.ts`**:
   - Linha 2 importa `getAdminClient` de `@/lib/supabase/admin` (módulo inexistente).
   - O correto é importar de `@/lib/supabase/clients.server`.

2. **`src/components/mailer-metrics-dashboard.tsx`**:
   - Linha 696 passa a propriedade `title` diretamente a um componente de ícone Lucide (`<Activity className="..." title="..." />`), gerando erro de tipagem TS2322.
   - Correção: Usar wrapper `<span title="...">` ou atributo compatível.

3. **`src/lib/email/resend-webhook.test.ts` e `src/lib/email/resend-email.test.ts`**:
   - `resend-webhook.test.ts` tenta importar `ResendWebhookEventPayload` (o nome exportado é `ResendWebhookPayload`).
   - `resend-email.test.ts` chama `verifyResendWebhookSignature` com parâmetros defasados e asserções em propriedades de resultado que foram refatoradas na TASK-087.

4. **`src/lib/email/recruit-email-send.test.ts`**:
   - O mock de `from("athlete_videos")` não implementava encadeamento duplo de `.eq()` (`.eq("athlete_id", ...).eq("kind", "highlight")`), causando `TypeError` durante o teste unitário de envio em lote.

---

## 3. Escopo das Correções Propostas

1. **Corrigir o import do Supabase admin** em `src/lib/email/resend-webhook.server.ts`:
   - `import { getAdminClient } from "@/lib/supabase/clients.server";`

2. **Ajustar a tipagem do ícone** em `src/components/mailer-metrics-dashboard.tsx`:
   - Remover `title` do SVG do Lucide e envolvê-lo em um container ou tooltip sem violar as propriedades estritas do Lucide.

3. **Alinhar testes de webhook e envio**:
   - Ajustar mocks e tipos em `src/lib/email/resend-webhook.test.ts`, `src/lib/email/resend-email.test.ts` e `src/lib/email/recruit-email-send.test.ts` para refletir fielmente a API atual do webhook e da consulta de destaques de vídeos.

4. **Regras de Preservação**:
   - Nenhum arquivo de lock (`bun.lock`) ou `package.json` será alterado.
   - Nenhuma lógica de negócio, schema de banco ou layout visual será modificado.

---

## 4. Estratégia de Validação

- `bun run typecheck` (deve passar com 0 erros).
- `bun test` (100% dos testes devem passar com sucesso).
- `bun run lint` (0 erros).
- `bun run build` / `compile_applet`.
- Atualização documentada em `CERNE.md` e `BACKLOGER.md`.
