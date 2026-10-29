<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

# REGRAS MANDATÓRIAS PARA AGENTES DE IA (AI GOVERNANCE)

1. **LEITURA OBRIGATÓRIA**: Todo agente de IA deve obrigatoriamente ler os arquivos [`README.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/README.md), [`CERNE.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/CERNE.md), [`BACKLOGER.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/BACKLOGER.md), [`UI&UX.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/UI&UX.md) e todos os planos em [`think/`](think/README.md) antes de realizar qualquer alteração ou tomar qualquer decisão.
2. **PLANEJAMENTO, REGISTRO E APROVAÇÃO HUMANA PRÉVIA**: Todo planejamento de solução deve ser salvo em Markdown na pasta [`think/`](think/README.md) **antes de ser apresentado**. Nenhuma alteração no código (inclusão, alteração ou remoção) pode ser feita sem apresentar primeiro esse plano detalhado e obter **aprovação prévia e explícita do usuário humano**.
3. **DOCUMENTAÇÃO VIVA (`CERNE.md`)**: Após qualquer edição em arquivos de código (funções, componentes, telas, rotas, tipos ou banco de dados), a IA deve obrigatoriamente atualizar a documentação viva em [`CERNE.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/CERNE.md).
4. **REGISTRO DE TAREFAS (`BACKLOGER.md`)**: Todas as solicitações recebidas por qualquer agente devem ser registradas em [`BACKLOGER.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/BACKLOGER.md), contendo o que foi pedido, data/hora, solicitante, executor e o status (`[CONCLUÍDO]` ou `[PENDENTE]`).
5. **DESIGN SYSTEM & MOBILE-FIRST (`UI&UX.md`)**: Todas as telas e evoluções visuais devem obrigatoriamente seguir o guia oficial de UI/UX em [`UI&UX.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/UI&UX.md), com foco em mobile-first, excelente UX/UI e acessibilidade.
6. **GOVERNANÇA DO `bun.lock` E DEPENDÊNCIAS**: O `bun.lock` só pode ser alterado por `bun add`/`bun install` com Bun 1.3.14 a partir do `package.json` atual. Ambientes que não consigam rodar exatamente isso (ex.: AI Studio) não devem regenerar nem commitar `bun.lock` nem `package.json` divergentes. Se o ambiente alterar o lock sozinho, desfaça antes de entregar. Nunca utilize flags perigosas para contornar vulnerabilidades (como `DANGEROUSLY_DEPLOY_VULNERABLE_TANSTACK_START_XSS=1`).
7. **PORTÃO ANTI-BUILD-QUEBRADA (OBRIGATÓRIO ANTES DE QUALQUER ENTREGA/COMMIT)**: o histórico mostra a build da Vercel quebrando repetidamente por `bun.lock` dessincronizado do `package.json` (`lockfile had changes, but lockfile is frozen`) e por typecheck vermelho escondido atrás de "testes verdes". Toda entrega deve cumprir, nesta ordem, e o agente deve **colar a saída real** de cada comando no BACKLOGER.md (nunca declarar "100% verde" sem executar):
   1. `bun install --frozen-lockfile` — deve passar sem alterar nada. Se falhar, NÃO "conserte" regenerando o lock: restaure com `git checkout <último-commit-bom> -- bun.lock` e avise o humano.
   2. `git diff --exit-code -- package.json bun.lock` — ambos intocados, salvo pedido explícito de mudança de dependência (feita só com Bun 1.3.14). Agentes de IA NUNCA modificam bun.lock nem package.json. Se uma tarefa exigir mudança de dependência, PARE e peça ao humano. Antes de todo commit, rode git diff --name-only e remova bun.lock/package.json do staging se aparecerem.
   3. `bun run validate` (= lint + typecheck + test + build). Os quatro precisam sair com código 0. Erro de typecheck NÃO é aceitável mesmo que o build passe: o CI roda typecheck antes do build.
   4. Testes não podem depender de rede/DNS/serviços externos: mocke `node:dns`, Resend e Supabase.
   5. Mudou contrato de função (retorno, tipo, assinatura)? Rode `grep -rn "<nome>" src` e atualize TODOS os chamadores, incluindo `src/server.ts`, que não tem teste.
   6. Commits de documentação/plano não podem carregar código: um commit "docs" só altera documentação.
   7. O teste `src/lib/lockfile-sync.test.ts` é guarda obrigatória: nunca remova, pule ou relaxe esse teste para "passar" a build.
      Se qualquer etapa falhar e não puder ser resolvida sem violar estas regras, PARE e reporte ao humano em vez de entregar código quebrado.
