# Pop-up de celebração de fase no portal do atleta

Quando a agência avança o atleta de fase, ele passa a ver — ao abrir a timeline — um dialog de celebração com a mensagem configurada pela agência, um slider de imagens (opcional) e uma explosão de confetes atrás do dialog.

## Comportamento para o atleta

- Ao entrar em `/portal/pipeline` (e no `/portal`), se houver uma fase avançada ainda não vista, o dialog abre automaticamente.
- Confetes disparam uma única vez, atrás do dialog.
- Conteúdo: título da fase, mensagem da agência (com placeholders já substituídos: nome do atleta, fase anterior, nova fase, agência) e o slider de imagens.
- Sem imagens configuradas: nenhum espaço vazio, nenhum placeholder, nenhuma seta ou indicador — o dialog fica só com o texto.
- Botão único "Continuar". Ao fechar, a fase é marcada como vista e o pop-up não volta a aparecer para ela.

## Configuração pela agência (Admin → Configurações → Etapa)

O dialog de edição da etapa ganha duas seções:
- **E-mail de celebração** (o que já existe hoje).
- **Pop-up no portal**: campo de texto com os mesmos placeholders + gerenciador de imagens (upload múltiplo, reordenar, remover) com preview.

Se o texto do pop-up estiver vazio, nenhum dialog é exibido para aquela fase. O e-mail continua funcionando de forma independente.

## Detalhes técnicos

**Banco (nova migração `0008_stage_portal_announcement.sql`)**
- `pipeline_stages`: novas colunas `portal_message_pt text` e `portal_message_en text`.
- Nova tabela `stage_celebration_images` (id, stage_id fk cascade, storage_path, sort_order, created_at) com GRANTs (`select` para authenticated, `all` para service_role) e RLS: leitura para authenticated, escrita apenas via `is_agency_admin()`.
- Nova tabela `athlete_stage_announcements` (id, athlete_id, stage_id, seen_at, unique(athlete_id, stage_id)) com GRANTs (`select, insert` para authenticated; `all` para service_role) e RLS: atleta lê/insere apenas as próprias linhas; agência lê tudo.
- Novo bucket público `stage-celebrations`: leitura pública, escrita e remoção apenas para `is_agency_admin()`.

**Frontend**
- `src/components/stage-celebration-dialog.tsx`: dialog (shadcn `Dialog`) com slider de imagens renderizado apenas quando houver imagens; setas e indicadores ocultos quando houver só uma.
- `src/hooks/use-stage-announcement.ts`: identifica a fase pendente (fase atual/concluída mais recente, sem registro em `athlete_stage_announcements` e com mensagem de pop-up preenchida), carrega as imagens e expõe `dismiss()`.
- `src/components/confetti-celebration.tsx`: extrair a rotina de disparo para uma função `fireConfetti()` reutilizável (mantendo o comportamento atual de `?celebrate=true`) e chamá-la uma vez na abertura do dialog, com `zIndex` abaixo do overlay do modal.
- Montar o dialog em `src/routes/_authenticated/portal/pipeline.tsx` e em `src/routes/_authenticated/portal/index.tsx`.
- `src/routes/_authenticated/admin/settings.tsx`: nova seção "Pop-up no portal" com textarea e upload/reordenação/remoção de imagens no bucket `stage-celebrations`.
- `src/types/db.ts`: tipos das novas colunas e tabelas.

**Documentação**: atualizar `CERNE.md` e registrar a tarefa em `BACKLOGER.md`.