# Auditoria de execução e segurança — o que falta para rodar

Revisei o código atual (clients Supabase, server functions, rotas privadas, migrations e configuração Vercel). Resumo: **nenhuma chave secreta está exposta ao navegador hoje**, mas há três ajustes de padrão e uma checklist de configuração para o app rodar de ponta a ponta.

## O que já está correto

- Só variáveis `VITE_*` chegam ao browser (`src/lib/supabase/env.ts`); a URL e a chave publicável são públicas por natureza e protegidas por RLS.
- A service role key vive apenas em `clients.server.ts` (sufixo `.server.ts` bloqueia o bundle do cliente) e é importada dinamicamente dentro dos handlers.
- `.env` está no `.gitignore`; a Resend key é lida apenas no servidor.
- Migrations `0001`–`0004` já criam tabelas com GRANTs, RLS, `has_role` e políticas de Storage (`athlete-media` público, `athlete-media-pending` e `documents` privados).

## Ajustes de segurança/padrão a fazer

1. **Parar de enviar o access token no corpo da requisição.**
   `src/lib/auth.functions.ts` recebe `accessToken` como input e valida com o cliente admin. Já existem `attachSupabaseAuth` (header `Authorization`, registrado em `src/start.ts`) e `requireAuth` / `requireAgency` — porém não usados. Trocar as duas server functions para `.middleware([requireAgency])` / `.middleware([requireAuth])`, remover `accessToken` dos inputs e dos call sites (`admin.athletes.$id.tsx`, `auth.accept-invite.tsx`). Ganho: token deixa de circular em body/logs e a verificação de papel passa a rodar com RLS do próprio usuário, usando o admin só para o que exige privilégio.
2. **Rotas privadas fora do SSR e sob um único portão.**
   `admin.*` e `portal.*` são rotas SSR de topo protegidas só no cliente por `ProtectedPage` (efeito colateral: HTML de área restrita renderizado no servidor e piscada de conteúdo). Mover para o layout sem path `_authenticated` com `ssr: false` e `beforeLoad` fazendo `supabase.auth.getUser()` + redirect para `/login`; a verificação de papel (`agency_admin` vs `athlete`) fica em sub-layouts `_authenticated/admin` e `_authenticated/portal`. As páginas públicas (`/`, `/athlete/$slug`, login, reset) continuam com SSR para SEO.
3. **Nunca depender de `APP_URL` padrão.**
   `auth.functions.ts` cai em `http://localhost:3000` quando `APP_URL` não existe — convites enviados em produção apontariam para localhost. Passar a falhar explicitamente se `APP_URL` estiver ausente em produção.

## Checklist para rodar (Supabase + Vercel)

**No Supabase**

- Rodar em ordem `db/migrations/0001` → `0004` no SQL Editor (idempotentes).
- Criar o primeiro usuário no painel Auth e rodar o bloco de bootstrap de `docs/SETUP.md` (cria a agência e o papel `agency_admin`).
- Authentication → URL Configuration: `Site URL` = domínio Vercel e adicionar em Redirect URLs `https://<dominio>/reset-password` e `https://<dominio>/auth/accept-invite` (sem isso, convite e recuperação de senha quebram).
- Confirmar que os três buckets existem após as migrations.

**Na Vercel (Preview e Production)**

| Variável                                             | Escopo                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | build/browser (públicas)                                           |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`           | servidor                                                           |
| `SUPABASE_SECRET_KEY`                                | servidor — **nunca** com prefixo `VITE_`                           |
| `APP_URL`                                            | URL pública do ambiente                                            |
| `RESEND_API_KEY`, `EMAIL_FROM`                       | servidor (sem eles, e-mails são apenas registrados como `skipped`) |

Build Command `bun run build`; `vite.config.ts` já usa `nitro: { preset: "vercel" }`.

## Entregável desta etapa

Aplico os itens 1–3, rodo `bun run validate` (lint + typecheck + testes + build) e te devolvo a lista final de variáveis a conferir na Vercel. Nenhuma mudança de banco é necessária — as migrations atuais cobrem o modelo.
