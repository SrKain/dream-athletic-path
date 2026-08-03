# Timeline gamificada de etapas

Transformar a lista simples de etapas em uma jornada visual, dividida em fases, com sensação de progressão de jogo — sem exagero: elegante, com toques de gamificação (nível 2 de 5).

## Onde

- **Portal do atleta** (`/portal/pipeline`) — a experiência principal, onde o atleta vive a jornada.
- **Ficha do atleta no admin** (`/admin/athletes/:id`) — a mesma timeline, em modo edição, para a agência.

## Por que a edição fica no admin

As regras de segurança do banco permitem que **só a agência** altere status, prazo e notas das etapas; o atleta tem permissão apenas de leitura. Mudar isso abriria a porta para o atleta se autoaprovar em etapas. Então:

- Atleta: vê a jornada, o progresso e o que falta (somente leitura).
- Agência: a mesma timeline, agora com controles inline para concluir, bloquear, reabrir, definir prazo e escrever notas.

Se você quiser mesmo que o atleta altere o próprio status, é uma mudança de política de segurança — dá para fazer, mas precisa ser um pedido explícito.

## Como fica a timeline

```text
  ┌─── Cabeçalho da jornada ─────────────────────────┐
  │  JORNADA DO ATLETA        3 de 6 fases concluídas│
  │  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░  50%               │
  └──────────────────────────────────────────────────┘

   ●━━━━━━━━●━━━━━━━━◉━ ─ ─ ─ ○ ─ ─ ─ ─ ○
  FASE 01  FASE 02  FASE 03  FASE 04  FASE 05
  concluída concluída  ATUAL   próxima  bloqueada
```

- **Trilho vertical** (mobile) que vira **trilho horizontal com cards** em telas grandes.
- Cada fase é um **card de etapa** com: número da fase em display grande, nome, descrição, selo de status, prazo e mini-checklist dos itens daquela etapa.
- **Estados visuais distintos**: concluída (selo preenchido, traço sólido, leve brilho), atual (card destacado, borda em cor primária, pulso sutil), próxima (neutro), bloqueada (esmaecida, cadeado).
- **Conexão entre fases**: o trilho entre os selos é preenchido conforme o avanço — a sensação de "fase liberada".
- **Header de progresso**: contador de fases concluídas, barra de progresso e a fase atual em destaque.
- Animações contidas: entrada em cascata dos cards, preenchimento do trilho, pulso no selo da fase atual. Respeita `prefers-reduced-motion`.
- Nada de emoji, nada de confete — o tom continua premium/esportivo, usando os tokens de cor já existentes.

## Modo edição (admin)

Na ficha do atleta, a mesma timeline ganha, dentro de cada card:

- Botões rápidos: Concluir / Em andamento / Bloquear / Reiniciar.
- Campo de prazo (data) e campo de notas, salvos direto na etapa.
- Feedback imediato (toast) e atualização otimista da barra de progresso.

## Detalhes técnicos

- Novo componente compartilhado `src/components/stage-timeline.tsx`, com prop `editable`; consome `pipeline_stages`, `athlete_stage_progress` e os itens de checklist já carregados.
- `src/routes/_authenticated/portal/pipeline.tsx` passa a renderizar o componente em modo leitura, usando o `usePortalData` atual.
- `src/routes/_authenticated/admin/athletes/$id.tsx` recebe a timeline em modo edição, substituindo o select solto de "Etapa do pipeline" (a troca de etapa atual passa a ser feita clicando na fase).
- Gravação via `supabase.from("athlete_stage_progress").upsert(...)` reusando `buildStageProgressPayload`, mais update de `athletes.current_stage_id` — mesma lógica já usada no Kanban.
- Estilos só com tokens do design system; nenhuma cor fixa. Sem novas dependências.
