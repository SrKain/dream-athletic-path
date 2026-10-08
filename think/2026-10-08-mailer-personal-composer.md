# Planejamento — Conclusão do Composer Pessoal do Mailer (Individual + Multi)

- **Data/Hora:** 2026-10-08 00:00 (Horário Local)
- **Autor/Executor:** GitHub Copilot
- **Solicitante:** Usuário Humano
- **Status:** [APROVADO] (instrução detalhada recebida via tarefa do usuário)

## 1. Objetivo

Concluir a integração do novo modelo de composição de e-mail pessoal no Mailer, aproveitando a base já existente em `src/lib/email/personal-email-renderer.ts` sem recriar a arquitetura nem mexer no Catalog.

## 2. Diagnóstico

A base correta já existe:

- `src/lib/email/personal-email-renderer.ts` define `EmailBlock` e `renderPersonalEmail(...)`.
- `src/lib/email/recruit-email-template.ts` já chama esse renderer para Single e Multi.
- O problema real está na UI do Mailer e no payload enviado ao backend: a rota administrativa e o `SendMailerInput` continuam presos ao modelo antigo de `customGreeting`, `customIntroduction` e `customHook`.

## 3. Escopo de Implementação

1. Atualizar a rota `/admin/mailer` para usar um composer visual de blocos (`text` + `athlete`) com default inicial editável.
2. Remover o modelo antigo de composição de 3 campos nos modos Individual e Multi, sem mexer no modo Catalog.
3. Garantir que o preview do Mailer use o mesmo renderer do envio (`renderPersonalEmail`).
4. Extender o payload do backend para transportar `blocks` e validar sanitização na camada de servidor.
5. Manter o render do Catalog intacto.
6. Adicionar testes de regressão sobre ordem, remoção e preview com blokk `EmailBlock[]`.
7. Atualizar `CERNE.md` e `BACKLOGER.md` ao concluir.

## 4. Estratégia

- Reaproveitar `renderPersonalEmail(...)` e `buildDefaultEmailBlocks(...)` como fonte de verdade.
- Manter o mínimo de mudanças possíveis, apenas conectando UI e payload ao que já existe.
- Em `SendMailerInput`, adicionar suporte a `blocks` em `customOptions` ou no nível do payload para compatibilidade com a estrutura atual.
- Na UI, construir operações de texto livre + inserção de atleta card + reordenação simples (`↑`, `↓`, remove), sem biblioteca pesada.
- Não alterar o Catalog nem o `recruit-email-catalog-template.ts`.

## 5. Validação

Executar:

- `bun run test`
- `bun run typecheck`
- `bun run build`
- `bun run lint`
- `bun run validate`

## 6. Critério de Aceitação

O Mailer deve permitir:

- escrever texto livre em blocos;
- inserir atletas no lugar desejado;
- reordenar e remover blocos;
- visualizar preview com o mesmo renderer do envio;
- enviar o payload de `blocks` no backend;
- continuar preservando footer e assinatura obrigatórios.
