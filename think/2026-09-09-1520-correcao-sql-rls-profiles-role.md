# Plano de Resolução: Correção de Erro SQL na Migration 0018 (column profiles.role does not exist)

- **ID da Tarefa:** TASK-063
- **Data/Hora:** 2026-09-09 15:20
- **Solicitante:** Kauan / Usuário Humano
- **Executor:** Antigravity / Gemini Agent
- **Status:** [PENDENTE DE APROVAÇÃO HUMANA]

---

## 1. Causa Raiz do Erro

Durante a execução manual ou automatizada da migration `db/migrations/0018_universities_and_mailer.sql` no Supabase SQL Editor, o PostgreSQL disparou:

```
Error: Failed to run sql query: ERROR: 42703: column profiles.role does not exist
```

### Investigação e Diagnóstico:

Na linha 89 a 101 de `db/migrations/0018_universities_and_mailer.sql`:

```sql
-- Incorreto:
create policy "Agency admin full access on universities"
  on public.universities for all
  to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'));

create policy "Agency admin full access on email_suppressions"
  on public.email_suppressions for all
  to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'agency_admin'));
```

No modelo de banco de dados do projeto (definido desde `0001_init.sql` e mantido em todas as migrações subsequentes):

1. A tabela `public.profiles` contém apenas: `id`, `full_name`, `avatar_url`, `locale`, `created_at`.
2. As atribuições de papéis (roles) ficam na tabela de segurança separada `public.user_roles (user_id, role)`.
3. Existe a função canônica utilitária de segurança `public.is_agency_admin()` definida em `0001_init.sql` e utilizada em todas as demais tabelas com RLS (`proposals`, `athlete_profiles`, `recruit_email_logs`, etc.).

---

## 2. Solução Proposta

1. **Correção em `db/migrations/0018_universities_and_mailer.sql`**:
   Substituir a consulta inválida `exists (select 1 from public.profiles ... and profiles.role = 'agency_admin')` pela função nativa do projeto `public.is_agency_admin()`.

   ```sql
   -- Políticas RLS corrigidas:
   drop policy if exists "Agency admin full access on universities" on public.universities;
   create policy "Agency admin full access on universities"
     on public.universities for all
     to authenticated
     using (public.is_agency_admin())
     with check (public.is_agency_admin());

   drop policy if exists "Agency admin full access on email_suppressions" on public.email_suppressions;
   create policy "Agency admin full access on email_suppressions"
     on public.email_suppressions for all
     to authenticated
     using (public.is_agency_admin())
     with check (public.is_agency_admin());
   ```

2. **Garantia de Idempotência e Suporte Completo no Script SQL**:
   O script SQL da migration 0018 já utiliza `create table if not exists`, `drop policy if exists` e checagens seguras com `do $$ begin ... end $$;`. Com a correção das duas políticas RLS, o script poderá ser colado e executado integralmente no Supabase SQL Editor com sucesso.

3. **Atualização Documental (`CERNE.md` e `BACKLOGER.md`)**:
   Registrar a correção da política de segurança na documentação viva.

---

## 3. Script SQL Pronto para Executar no Supabase

Após aprovação, além de atualizar o arquivo de migration no repositório, forneceremos o script SQL completo e corrigido para o usuário colar diretamente no Supabase SQL Editor.
