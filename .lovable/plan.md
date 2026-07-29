## Contexto e restrições

- **Sem Lovable Cloud.** Nenhuma tabela, auth, storage ou função será criada no ecossistema Lovable.
- Toda a persistência, autenticação, storage e e-mail apontam para um **projeto Supabase externo** (fornecido por você) + **Resend**.
- O código fica portável para Vercel/Netlify/Cloudflare/AWS: nada de APIs proprietárias do Lovable.

**Preciso de você antes de codar o banco:**
1. `SUPABASE_URL`
2. `SUPABASE_ANON_KEY` (publicável)
3. `SUPABASE_SERVICE_ROLE_KEY` (secreta)
4. `RESEND_API_KEY` + domínio remetente

As chaves secretas serão guardadas no cofre de secrets do projeto (variáveis de ambiente do servidor), nunca no código. A anon key vai em `.env` como `VITE_*`, o que é seguro por padrão porque toda a proteção real está nas políticas RLS.

---

## Arquitetura

```text
Browser ──► TanStack Start (SSR/edge)
              ├─ rotas públicas   → feed / perfil do atleta (leitura anon via RLS)
              ├─ rotas privadas   → agência / atleta (sessão Supabase, RLS por papel)
              └─ server functions → operações privilegiadas + Resend
                        │
                        ▼
              Supabase EXTERNO (Postgres + Auth + Storage)
```

Camada de acesso isolada em `src/lib/supabase/` — trocar de provedor no futuro exige mexer só nessa pasta.

Estrutura de pastas:
```text
src/
  components/{ui,layout,athlete,pipeline,feed,forms}
  routes/            páginas + endpoints
  features/          lógica por domínio (athletes, pipeline, documents, notifications)
  lib/supabase/      client browser, client servidor, middleware de auth
  lib/email/         serviço centralizado Resend + templates
  hooks/  services/  providers/  schemas/  types/  i18n/
```

---

## Modelo de dados (Supabase externo)

`profiles` (1:1 com auth.users) · `user_roles` (tabela separada + função `has_role`, obrigatório para evitar escalonamento de privilégio) · `agencies` · `athletes` · `athlete_profiles` · `athlete_media` · `achievements` · `positions` · `countries` · `sports` · `pipeline_stages` · `athlete_stage_progress` · `stage_checklists` · `checklist_items` · `athlete_checklist_items` · `documents` · `document_requests` · `notifications` · `email_log` · `invitations`

Decisões:
- Papel do usuário **nunca** em `profiles` — sempre em `user_roles` com enum `app_role ('agency_admin','athlete','coach')`.
- `athletes.slug` único → URL pública `/athlete/joao-silva`.
- `athletes.is_public` + `athlete_media.is_public` controlam o que a Agência libera no catálogo.
- Etapas dinâmicas: `pipeline_stages` pertence à agência, com `order_index`, `name_en`, `name_pt`; nada hard-coded.
- Campos de texto visíveis ao coach têm par `_en` / `_pt` para o multilíngue.
- Todas as tabelas: `GRANT`s explícitos + RLS habilitado.

RLS resumido:
| Tabela | anon | atleta | coach | agência |
|---|---|---|---|---|
| athletes / media / achievements | SELECT só `is_public` | SELECT/UPDATE próprio | SELECT público | ALL |
| documents / pipeline / checklists | — | SELECT próprio, INSERT upload | — | ALL |
| notifications | — | SELECT próprio | SELECT próprio | ALL |

Storage: bucket `athlete-media` público (fotos/vídeos do catálogo) e bucket `documents` **privado** com políticas por `athlete_id` no caminho + URLs assinadas.

---

## Escopo da entrega (MVP completo, uma parada para aprovação)

1. **Base** — camada Supabase externa, providers, i18n PT/EN, design system com tokens semânticos trocáveis (identidade visual entra depois sem refatorar componentes).
2. **Banco** — migração SQL completa idempotente, aplicada no seu Supabase; o arquivo fica versionado em `supabase/migrations/` para reprodução em qualquer ambiente.
3. **Auth** — login e-mail/senha, recuperação de senha, aceite de convite, guards de rota por papel, redirecionamento pós-login por perfil. Sem provedores sociais.
4. **Agência** — dashboard, CRUD de atletas, envio de convite, gestão de posições e etapas, aprovação/reprovação de documentos, avanço de pipeline.
5. **Atleta** — dashboard, edição do próprio perfil, upload de foto/vídeos/documentos, visualização do pipeline, pendências e checklist.
6. **Coach** — catálogo com busca e filtros (posição, país, idade, esporte).
7. **Feed público** — `/` estilo Netflix: hero, trilhas horizontais de cards grandes, destaques; sem login.
8. **Perfil público** — `/athlete/$slug` com SSR, metadados OG dinâmicos para compartilhamento.
9. **Notificações** — tabela + centro de notificações in-app.
10. **Resend** — serviço centralizado `sendEmail(type, to, data)` com todos os gatilhos ligados (boas-vindas, convite, mudança de etapa, solicitação/aprovação/reprovação de documento, reset de senha) e templates placeholder, registrando cada envio em `email_log`.

Ao final: paro, documento o que foi criado e as decisões arquiteturais, e aguardo sua aprovação antes de qualquer funcionalidade avançada.

---

## Melhorias que proponho (dentro do escopo, custo baixo)

- **`invitations` com token e expiração** em vez de depender só do convite nativo do Supabase — dá controle de reenvio e auditoria.
- **`email_log`** — rastreabilidade de todo disparo, indispensável para suporte.
- **Soft delete** (`deleted_at`) em `athletes` e `documents` — exclusão acidental é irreversível caso contrário.
- **Slug versionado** — se o nome do atleta mudar, o slug antigo redireciona, para não quebrar links já compartilhados com coaches.

Se preferir cortar alguma delas, é só dizer.

---

## Nota técnica

Rotas privadas usam layout `_authenticated` sem SSR (a sessão Supabase vive no `localStorage`); rotas públicas mantêm SSR para SEO e preview social. Operações privilegiadas (criar atleta, enviar convite, disparar e-mail) rodam em server functions com verificação de papel no servidor — o cliente nunca toca a service role key.
