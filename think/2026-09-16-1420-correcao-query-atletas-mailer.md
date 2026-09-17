# Plano de Correção: Query de Atletas e Tratamento de Erro no Mailer Administrativo

- **Data/Hora**: 2026-09-16 14:20
- **Autor/Executor**: Antigravity (AI Coding Agent)
- **Solicitante**: Kauan Iasin (kauan.iasin02@gmail.com)
- **Status**: [AGUARDANDO APROVAÇÃO HUMANA]

---

## 1. Contexto e Diagnóstico

### O Problema
No painel administrativo de disparo de e-mails para recrutadores/coaches (`/admin/mailer`), a seleção de atletas não funcionava (nem no modo "Atleta Único" nem no modo "Multi-Atleta em Lote"), pois a listagem de atletas permanecia sempre vazia, sem qualquer alerta ou erro visual exibido ao usuário.

### Causa Raiz
No arquivo `src/routes/_authenticated/admin/mailer.tsx`, dentro da função `loadInitialData()`:
1. A query na tabela `athletes` incluía `.eq("status", "approved")`.
2. A tabela `public.athletes` não possui coluna `status` (seus campos de visibilidade são `is_public` e `is_featured`, além de `deleted_at`).
3. O Supabase retornava erro `column athletes.status does not exist` (código 42703).
4. Como o código apenas verificava `if (athletesRes.data)` e descartava `athletesRes.error` sem validação nem log de erro, a falha era absorvida silenciosamente e o estado `athletes` permanecia `[]`.

---

## 2. Varredura no Código (Scope Scan)

Foi realizada busca em todo o repositório por outras consultas com `.eq("status", ...)` ou queries contra `athletes`:
- `src/routes/_authenticated/admin/mailer.tsx:166`: `.eq("status", "approved")` contra `athletes` ➔ **INCORRETO** (alvo desta correção).
- `src/lib/email/email.server.ts:169`: `.eq("status", "scheduled")` contra `email_queue` ➔ **CORRETO** (tabela possui coluna `status`).
- `src/components/send-recruit-email-dialog.tsx:68`: `.eq("status", "sent")` contra `recruit_email_logs` ➔ **CORRETO** (tabela possui coluna `status`).
- `src/routes/_authenticated/admin/index.tsx:28`: `.eq("status", "blocked")` contra `athlete_stage_progress` ➔ **CORRETO** (tabela possui coluna `status`).

Não há outras ocorrências indevidas de `.eq("status", ...)` contra `athletes`.

---

## 3. Plano de Implementação

### Passo 1: Correção da Query de Atletas em `src/routes/_authenticated/admin/mailer.tsx`
- Alterar o filtro `.eq("status", "approved")` para `.eq("is_public", true)`.
- Adicionar `.is("deleted_at", null)` para garantir que atletas arquivados/excluídos logicamente não sejam listados.

### Passo 2: Tratamento e Exibição Explícita de Erros em `loadInitialData()`
- Verificar explicitamente `athletesRes.error`: se existir, logar no console e emitir `toast.error` informativo.
- Verificar explicitamente `uniRes.error`: se existir, logar no console e emitir `toast.error` informativo.
- Garantir que erros em chamadas do Supabase nunca sejam silenciados sem feedback ao usuário e aos logs.

### Passo 3: Atualização da Documentação e Governança
- Atualizar `CERNE.md` registrando a correção na rota `/admin/mailer` e a boa prática de desestruturação e validação de `error` em chamadas Supabase.
- Registrar a tarefa e status em `BACKLOGER.md`.

---

## 4. Estratégia de Testes e Validação
1. **ESLint**: Executar `npm run lint` e garantir 0 erros.
2. **Vitest**: Executar `npm run test` e verificar se todos os 16 arquivos de teste e 106+ testes passam com sucesso.
3. **Build do Applet**: Executar `compile_applet` para certificar que a compilação de produção e SSR está íntegra.
4. **Validação Funcional**: Confirmar a renderização correta da lista de atletas públicos no seletor de "Atleta Único" e no grid de seleção de "Multi-Atleta em Lote".
