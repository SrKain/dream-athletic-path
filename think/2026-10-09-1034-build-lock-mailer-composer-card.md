# Entrega única: build da Vercel + texto do Mailer + novo card da atleta

## 1. Build da Vercel (prioridade 1)

**Causa confirmada:** o `bun.lock` publicado não bate com o `package.json`. O `package.json` fixa `@lovable.dev/vite-tanstack-config` em `2.25.3` e `nitro` em `3.0.260603-beta`, mas o lockfile ainda resolve `vite-tanstack-config@2.13.1` e outra faixa do `nitro`. Por isso o `bun install --frozen-lockfile` aborta com "lockfile had changes". O código da aplicação não tem culpa.

**Correção:**
- Gerar o `bun.lock` de novo com **Bun 1.3.14**, a versão exata da Vercel e do `packageManager`, usando `bunx bun@1.3.14 install`. O sandbox tem 1.3.3, então não vou usá-lo para mexer no lock.
- Confirmar que o novo lock registra `vite-tanstack-config@2.25.3`, `nitro@3.0.260603-beta`, `react-start@1.168.60+` e nenhuma ocorrência de `1.168.48`.
- Rodar `bunx bun@1.3.14 install --frozen-lockfile` sem erros. Isso reproduz o comando da Vercel.
- Não mexer em `vercel.json`, overrides ou versões. Não usar bypass de CVE.

## 2. Mailer: o texto digitado não aparece no preview nem no envio (prioridade 1)

**Causa confirmada:** os modos Individual e Multi mostram os campos antigos (Saudação, Hook e Texto Institucional). Só que preview e envio sempre passam `blocks`, que são os blocos padrão do composer. O `resolveLegacyBodyBlocks` devolve `blocks` primeiro e ignora os três campos. Além disso, o editor de blocos (`composerBlocks`, `updateComposerTextBlock`, mover e remover) existe no estado, mas nenhuma tela o mostra.

**Correção (só Individual e Multi; Catalog fica intacto):**
- Tirar os 3 campos antigos dos modos Individual e Multi.
- Mostrar o **editor de blocos**:
  - uma caixa de texto livre por bloco de texto, pré-preenchida com "Hi Coach, ..." e "Let me know what you think.";
  - um bloco "card da atleta" para cada atleta selecionada;
  - botões subir, descer e remover, além de "+ Texto" e "+ Atleta".
- O preview usa o mesmo `composerBlocks` que vai para o envio, com o mesmo renderer, então o que aparece no preview é o que o coach recebe.
- Quando a seleção de atletas muda, o texto já digitado continua. Só entram ou saem os blocos de card correspondentes.
- No servidor, `sendMailer` aplica `sanitizeEmailBlocks` e usa `blocks` como fonte única nos modos single e multi.

## 3. Novo card da atleta (layout da arte enviada)

Card em HTML de e-mail, feito com tabelas e estilos inline e compatível com Gmail e Outlook, seguindo a arte:

```text
[ Faixa amarela: NOME | POSIÇÃO | ALTURA (ft/cm) | PAÍS ]
[ Foto ]  [ TRANSFER | AVAILABLE: <termo> | GPA x.x ]
          [ QUICK FACTS: Position, Height, GPA, Current School,
            Transfer, Available, Intended Major, From (bandeira) ]
[ SEASON STATS: até 2 temporadas com números ]
[ WATCH HER IN ACTION: até 2 vídeos com miniatura do YouTube ]
[ WHY SHE COULD FIT YOUR PROGRAM: até 4 itens ]
[ RECRUIT NOW ]  [ VIEW FULL PROFILE ]  [ NOT A FIT ]
```

- **Origem dos dados:** atleta e perfil (`current_school`, `course_of_interest`, `athlete_status`, `college_start_date`, `gpa`, `stats`, `team_contribution_en`, `highlight_note`) e os vídeos da atleta (`highlight`, `feature`).
- **Seção sem dados:** some inteira, sem deixar espaço vazio nem texto como "N/A".
- **Os 3 botões:**
  - **Recruit Now** abre um e-mail de contato já preenchido;
  - **View Full Profile** abre a página pública da atleta com o rastreamento atual;
  - **Not a Fit** abre o feedback que já existe.
- **Visual:** verde-escuro e amarelo da marca, já definidos no `email-brand`. Ícones em imagem PNG, porque e-mail não aceita SVG; vou reaproveitar os de `public/email/icons`. Faixas de título com letras espaçadas. No celular, as colunas viram uma pilha.
- Assinatura e rodapé obrigatórios ficam como estão (Unsubscribe, Not the right fit, Go to catalog).

## 4. Validação antes de entregar

- `bunx bun@1.3.14 install --frozen-lockfile` sem erros.
- `bun run lint`, `bun run typecheck`, `bun run test` e `bun run build` passando.
- Testes novos:
  - o texto digitado num bloco aparece no HTML do preview e do envio, nos modos Individual e Multi;
  - a ordem dos blocos é respeitada;
  - os 3 botões estão em todo card;
  - seções sem dados não são exibidas;
  - texto com HTML é escapado.
- Abrir o Mailer logado no navegador de teste, digitar um texto e conferir na captura de tela que o preview atualiza e que o card novo aparece com os 3 botões.

## 5. Governança

- Salvar este plano em `think/2026-10-09-1034-build-lock-mailer-composer-card.md` antes de editar qualquer código.
- Registrar a tarefa em `BACKLOGER.md` e as mudanças em `CERNE.md` (lockfile, composer, card).
- Não alterar: modo Catalog, Resend, métricas, webhooks, banco de dados nem outras telas.

## Detalhes técnicos

- Arquivos:
  - `bun.lock`
  - `src/routes/_authenticated/admin/mailer.tsx` (UI do composer, remoção dos campos antigos)
  - `src/lib/email/recruit-email-template.ts` (blocos como fonte única)
  - `src/lib/email/recruit-email.ts` (novo `renderAthleteCard` e mapeamento dos campos)
  - `src/lib/email/recruit-email.server.ts` (busca de `stats`, `current_school`, `course_of_interest` e vídeos para o card; `blocks` sanitizados)
  - testes em `src/lib/email/*.test.ts`
- `RecruitEmailAthlete` ganha campos opcionais: `currentSchool`, `intendedMajor`, `seasons[]`, `videos[]`, `fitReasons[]`.
- Thumbnails do YouTube: `https://img.youtube.com/vi/<id>/hqdefault.jpg`, usando o `src/lib/youtube.ts` existente.
