# Plano — Ajustes finos da assinatura e dos botões do card

- **Data/Hora:** 2026-10-09 12:21 (America/Sao_Paulo)
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Codex
- **Status:** `[IMPLEMENTADO — TYPECHECK/BUILD NÃO EXECUTADOS: BUN E DEPENDÊNCIAS AUSENTES]`
- **Escopo:** endereço exibido na assinatura e visual dos cards do Mailer Individual/Multi.

## 1. Objetivo

Aplicar três ajustes observados pelo usuário:

1. Exibir `contact@goteamgoagency.com` na assinatura da Fabiana.
2. Reduzir o volume visual dos botões do card, usando as cores de ação da marca/UI (verde esmeralda, branco/off-white e borda verde), mantendo alvos de toque compatíveis com mobile.
3. Reduzir o tamanho visual do nome da atleta sem diminuir o peso tipográfico atual (`font-weight: 900`).

## 2. Diagnóstico e decisões

- `EMAIL_SIGNATURE.email` hoje está definido como `fabiana@goteamgoagency.com`; `renderSignature()` o usa para exibir o endereço e compor o `mailto:` da assinatura.
- O mesmo endereço também é reutilizado por ações de recrutamento e CTAs. Para corrigir a assinatura sem mudar o destino já estabelecido de `RECRUIT NOW`, separar o endereço público da assinatura (`contact@goteamgoagency.com`) do endereço de recrutamento atual (`fabiana@goteamgoagency.com`).
- A diretriz `UI&UX.md` recomenda verde esmeralda para CTAs primários, texto claro sobre a ação primária, dourado como acento, botões com cantos arredondados e área de toque mínima de 44px. O card atual mostra três botões em colunas de largura total, com combinação de preenchimentos que deixa a linha visualmente pesada.
- Manter o CTA `VIEW FULL PROFILE` como primário em verde; `RECRUIT NOW` como secundário de fundo claro e borda verde; `NOT A FIT` como ação terciária discreta. Reduzir a largura/espacamento e tipografia dos botões, sem reduzir a altura mínima de toque de 44px.
- O nome da atleta está em caixa alta, `font-size: 26px` e `font-weight: 900`. Reduzir para aproximadamente 19–20px, mantendo `font-weight: 900` e a hierarquia existente.

## 3. Arquivos previstos

- `src/lib/email/email-brand.ts` — configurar o e-mail de assinatura como `contact@...` e preservar um destino separado para contatos de recrutamento.
- `src/lib/email/email-layout.ts` — nenhuma mudança estrutural prevista; o renderer da assinatura já consome `EMAIL_SIGNATURE.email`.
- `src/lib/email/recruit-email.ts` — manter o `mailto:` dos botões/ações de recrutamento apontando para Fabiana conforme o fluxo atual.
- `src/lib/email/athlete-board-card.ts` — compactar a linha de ações, aplicar cores da marca/UI e reduzir o tamanho do nome mantendo peso 900.
- `CERNE.md` e `BACKLOGER.md` — registrar o resultado após implementação.

## 4. Etapas

1. Separar o e-mail de contato mostrado na assinatura do endereço direto da ação de recrutamento.
2. Ajustar os estilos inline de `VIEW FULL PROFILE`, `RECRUIT NOW` e `NOT A FIT`: primário verde sólido, secundário claro com borda verde e terciário discreto, com largura visual menor e alvos de toque de pelo menos 44px.
3. Diminuir o `font-size` do nome para 19–20px, preservando caixa alta e `font-weight: 900`.
4. Atualizar a documentação e revisar o diff para confirmar que a mudança ficou limitada à assinatura e ao card.

## 5. Estratégia de validação e risco

- Conferir por inspeção do HTML renderizado que a assinatura mostra e linka `contact@goteamgoagency.com`.
- Confirmar que `RECRUIT NOW` continua endereçando o contato de Fabiana e que os três rótulos/links continuam intactos.
- Conferir estilos inline, contraste, altura mínima de toque e nome da atleta em largura mobile e desktop.
- Não alterar `package.json`, `bun.lock`, `vercel.json`, dependências, consultas ou backend.
- Typecheck/build dependem de Bun e dependências instaladas; o ambiente anterior não os disponibilizou. Não regenerar lockfile.

## 6. Aprovação

O usuário aprovou este plano em 2026-10-09. Implementação concluída; `git diff --check` passou. Typecheck/build não executados porque Bun e `node_modules` não estão disponíveis. Arquivos da build/deploy não foram alterados.
