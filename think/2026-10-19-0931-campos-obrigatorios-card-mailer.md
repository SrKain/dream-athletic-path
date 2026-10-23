# Plano — Campos obrigatórios e card completo no Mailer

- **Data/hora:** 2026-10-19 09:31 (America/Sao_Paulo)
- **Solicitante:** responsável pelo repositório (SrKain)
- **Executor:** ChatGPT (GitHub conectado)
- **Base:** `main` @ `32b17976b847afd9c154d2b6f0f8bb18b828eca5`
- **Branch:** `feat/2026-10-19-mailer-card-campos-obrigatorios`
- **Aprovação humana:** explícita no prompt de 2026-10-19 (execução autorizada).
- **Status:** execução concluída; validação GitHub Actions `39256913678` aprovada (200/200 testes, typecheck, lint e build). Sem migrations ou alterações no lockfile/dependências.

## Contexto

O carregamento legado de `recruit-email.server.ts` não seleciona `bio_en`, e as estruturas da fila, do preview administrativo e do diálogo usam selects/mapeamentos divergentes. O template pessoal do Mailer renderiza o mesmo `renderAthleteBoardCard`, mas recebe campos incompletos.

## Solução e arquivos

1. Centralizar carregamento completo e em lote em `src/lib/email/athlete-email-data.server.ts`: `athletes`, `athlete_profiles` (bio/fit/estatísticas/ficha), `sports`, `positions`, `countries` e `athlete_videos` (highlight/feature, 2 por atleta), com checagem explícita de erros, sem consultas por destinatário. Exportar validador puro para indicar por atleta campos obrigatórios faltantes.
2. Expor consulta autenticada apenas para agência em `recruit-email.functions.ts`. Ambos os previews passam a consumir esse mesmo resultado; atualizar estado e indicador de carregamento para não disparar com dados ausentes.
3. Substituir mapeamento divergente do enfileiramento em `mailer-queue.server.ts` e do envio legado em `recruit-email.server.ts`. Validar antes da inserção de campanha/logs/envios; catalog permanece inalterado. Manter arquitetura browser-driven, micro-lotes, idempotência, métricas, Reply-To e textos canônicos.
4. Adicionar `aboutHer` e `highSchoolGraduation` aos tipos de card, propagar em `email-layout.ts` e `recruit-email-template.ts`. Renderizar ABOUT HER com parágrafos escapados e painel oficial; seção de fit prioriza dado real. Retirar chips redundantes de GPA/AVAILABLE e fatos duplicados da faixa amarela; completar Quick Facts.
5. Adicionar no Mailer bloqueio com nomes, campos faltantes, link de edição `/admin/athletes/:id` e aviso não bloqueante para HTML >90KB (estimativa de clipping Gmail ~102KB). Atualizar plain text do composer e geradores legados.
6. Ampliar Vitest para renderização, escape, parágrafos, validação, fallback, texto e paridade do card entre rotas; atualizar `BACKLOGER.md` e `CERNE.md`.

## Decisões

- Não criar migration; colunas `bio_en` e `team_contribution_en` já existem.
- Omissão de campos vazios é mantida no card; obrigatoriedade é trava de envio.
- Preview reflete os mesmos dados de atleta, mas nome/recipiente/ID da campanha no preview podem mudar URLs e personalização de coach no envio.
- Remover Position, Height e From da tabela evita duplicidade; foto e painel permanecem alinhados.
- Não tocar `bun.lock` ou `package.json`.

## Validação

Executar, se ambiente disponível, Bun 1.3.14 com `bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`, `bun run test` e `bun run build`. Se CI remoto acionável por PR, confirmar status e logs de cada etapa. Registrar limitações verificáveis sem alegar aprovação não comprovada.

## Riscos

Falha de coluna ou RLS: resposta explícita de erro e bloqueio; nunca exibir preview enganoso. Campanha multi com bio extensa: notificação >90KB, conteúdo integral sem truncamento. Aumento de payload e tempo de carregamento: consultas agrupadas por seleção/campanha em vez de por destinatário.
