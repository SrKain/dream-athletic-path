# Go Team Go — configuração

## Pré-requisitos

- Bun 1.3.14
- Node.js 20.19 ou superior (22 LTS recomendado)
- Um projeto Supabase externo exclusivo para o ambiente
- Uma conta Resend
- Um projeto Vercel conectado a este repositório

## Desenvolvimento local

1. Instale as dependências com `bun install`.
2. Copie `.env.example` para `.env`.
3. Preencha as chaves públicas e privadas do Supabase.
4. Execute, em ordem, os arquivos de `db/migrations` no SQL Editor do Supabase.
5. Inicie a aplicação com `bun run dev`.

Sem as variáveis públicas do Supabase, a aplicação abre uma tela segura de
configuração em vez de tentar conectar a um backend inexistente.

## Primeiro administrador

Não existe cadastro público. Crie o primeiro usuário no painel do Supabase Auth
e execute o bloco abaixo no SQL Editor, substituindo os valores indicados:

```sql
begin;

insert into public.agencies (name, slug)
values ('Go Team Go', 'go-team-go')
on conflict (slug) do update set name = excluded.name;

insert into public.user_roles (user_id, role)
values ('<AUTH_USER_UUID>', 'agency_admin')
on conflict (user_id, role) do nothing;

commit;
```

A criação da agência também cria as cinco etapas padrão do pipeline. Senhas e
service role keys nunca devem ser registradas em migrations ou commits.

## Vercel

Use `bun run build` como Build Command. Cadastre todas as variáveis de
`.env.example` no ambiente Preview e defina `APP_URL` com a URL da homologação.
As variáveis `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` são server-only e
nunca devem usar o prefixo `VITE_`.

Antes de publicar uma revisão, execute:

```sh
bun run validate
```
