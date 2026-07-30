# Roteiro de homologação e demonstração

## Preparação única

1. Configure as variáveis de `.env.example` localmente e na Vercel.
2. Execute `0001_init.sql`, `0002_mvp_hardening.sql`,
   `0003_operational_defaults.sql` e `0004_operational_notifications.sql`.
3. Crie o usuário administrador no Supabase Auth e execute o bootstrap descrito
   em `docs/SETUP.md`.
4. Execute `db/demo_seed.sql`.
5. Em Authentication → URL Configuration, configure a URL da aplicação e inclua:
   - `/reset-password`
   - `/auth/accept-invite`
6. Entre como administrador e envie o convite do atleta demonstrativo.

## Ensaio sugerido

1. Abra `/` sem login, filtre o catálogo e acesse um perfil publicado.
2. Entre em `/login` como administrador.
3. Mostre o dashboard e abra o atleta demonstrativo.
4. Altere uma etapa, solicite um documento e envie um convite.
5. Em uma janela anônima, aceite o convite e entre no portal do atleta.
6. Mostre pipeline e checklist, envie um documento e uma mídia.
7. Volte ao painel administrativo, aprove o documento e publique a mídia.
8. Reabra o perfil público para mostrar que somente o conteúdo aprovado aparece.

## Critério de pronto

- O catálogo público não expõe e-mail, IDs de autenticação ou documentos.
- Um atleta não acessa `/admin` nem dados de outro atleta.
- Arquivos privados são baixados apenas por URL assinada.
- Convite, login, upload, revisão e publicação usam dados reais do Supabase.
- `bun run validate` e o smoke test da URL Preview terminam sem erro.
