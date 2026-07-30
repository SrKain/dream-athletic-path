# Go Team Go — configuração

## Pré-requisitos

- Bun 1.3.14
- Node.js 20.19 ou superior (22 LTS recomendado)
- Um projeto Supabase externo exclusivo para o ambiente
- Um projeto Vercel conectado a este repositório

## Desenvolvimento local

1. Instale as dependências com `bun install`.
2. Copie `.env.example` para `.env`.
3. Preencha a Publishable key e a Secret key do Supabase.
4. Execute, em ordem, todos os arquivos de `db/migrations` no SQL Editor do Supabase.
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

Para preparar a apresentação, execute opcionalmente `db/demo_seed.sql` depois
de todas as migrations. O seed cria atletas e conteúdo, mas nunca cria usuários
Auth ou senhas.

## Vercel

Use `bun run build` como Build Command. Cadastre todas as variáveis de
`.env.example` no ambiente Preview e defina `APP_URL` com a URL da homologação.
`SUPABASE_SECRET_KEY` é server-only e nunca deve usar o prefixo `VITE_`.
Convites e recuperação usam temporariamente o serviço de e-mail do Supabase Auth.

`APP_URL` é obrigatória: sem ela o envio de convites falha em vez de gerar um
link apontando para `localhost`.

No painel do Supabase, em Authentication > URL Configuration, defina o
`Site URL` com o domínio publicado e inclua nas Redirect URLs:

- `https://<dominio>/reset-password`
- `https://<dominio>/auth/accept-invite`

Sem essas URLs, recuperação de senha e aceite de convite não funcionam.

Antes de publicar uma revisão, execute:

```sh
bun run validate
```
