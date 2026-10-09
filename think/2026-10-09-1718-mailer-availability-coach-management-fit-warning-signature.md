# TASK-094 — Mailer: disponibilidade, gestão de coaches, conflitos de fit e assinatura

## Objetivo

Implementar as quatro melhorias pedidas para o Mailer e a operação de coaches, protegendo o fluxo de produção/Vercel e seguindo `UI&UX.md`.

## Diagnóstico do repositório

1. **Available no card:** o perfil administrativo da atleta já armazena `athlete_profiles.seeking_opportunities` e o tipo `AthleteProfile` já possui esse campo. O card do email rotula `Available`, mas hoje deriva o valor de `college_start_date`, consultado em ambos os loaders (Mailer e envio no servidor).
2. **Coaches:** já existe a tela `/admin/coaches`, mas ela cadastra contatos em `public.coaches` com nome, email e instituição livre. A tela de Universidades armazena o coach efetivamente usado pelo Mailer em `universities.coaches` (JSONB: id, primeiro/sobrenome, email, role, phone). O Mailer lê exclusivamente os coaches ligados às universidades. O fluxo legado `send-recruit-email-dialog.tsx` e `sendRecruitEmailToCoaches` ainda lê a tabela `coaches`, criando duas origens de cadastro.
3. **Conflitos de envio:** o Mailer já carrega sinais ativos de `coach_interest_signals` e mostra badges, mas não interrompe o fluxo para confirmação. O badge de `other_positions_only` ainda não compara a posição da atleta. Sinais disponíveis: `fully_recruited`, `position_not_needed`, `other_positions_only`, `specific_athlete_dislike`; `email_suppressions` é um bloqueio separado e já exclui destinatários do disparo.
4. **Assinatura:** `renderSignature` já torna `@goteamgoagency` clicável usando `EMAIL_SIGNATURE.instagramUrl`. Ainda falta WhatsApp. O telefone solicitado será representado como `+55 (11) 99923-9490`, com link `https://wa.me/5511999239490`.

## Plano de implementação

### 1. Usar `Seeking Opportunities For` no campo `Available` do card

- Buscar `seeking_opportunities` nas consultas usadas pelo Mailer e pelo serviço de envio e mapeá-lo em campo próprio na estrutura de email, sem reaproveitar `collegeStartDate`.
- Fazer o rótulo `Available` do card refletir esse campo em Individual e Multi, preview e envio real, renderização HTML e texto puro.
- Preservar `college_start_date` como dado distinto do perfil para os consumidores que ainda o utilizem.
- Quando `seeking_opportunities` estiver vazio, omitir a linha/badge de Available, sem fallback silencioso para a data anterior.

### 2. Tornar `/admin/coaches` a tela dedicada dos coaches vinculados às universidades

- Evoluir a rota existente `/admin/coaches` (não criar outra rota concorrente). A tela listará coaches extraídos de `universities.coaches`, exibindo o vínculo com a universidade e permitindo busca/filtro por universidade.
- Criação e edição exigirão selecionar uma universidade. Campos editáveis: primeiro nome, sobrenome, email, cargo/role e telefone, correspondentes aos dados que a estrutura atual já suporta.
- Preservar o cadastro de coaches dentro da edição de Universidade. Garantir que uma edição posterior da universidade não apague role/phone ou outros campos opcionais inseridos na tela dedicada.
- Incorporar nessa tela o gerenciamento dos sinais de fit e do opt-out, reaproveitando os endpoints seguros e a semântica de TASK-093: quatro razões com posição/atleta/observações, expiração/histórico e encerramento; pausa de seis meses ou bloqueio permanente; reativação apenas de bloqueios manuais. A UI permitirá selecionar o coach pelo vínculo Universidade + email.
- Resolver registros legados: detectar contatos que ainda existam apenas em `public.coaches` e oferecer associação explícita a uma universidade para incluí-los na lista canônica. Não apagar a tabela legada nem descartar dados silenciosamente.
- Manter `universities.coaches` como fonte canônica, pois esse é o conjunto já usado no Mailer. Alinhar os leitores legados `send-recruit-email-dialog.tsx` e `sendRecruitEmailToCoaches` a essa fonte para evitar que emails antigos operem sobre uma lista separada. A tabela `public.coaches` permanece intacta para compatibilidade enquanto os consumidores são migrados.
- Usar o Design System existente: tokens (`--background`, `--foreground`, `--primary`, `--gold`, `--border`), painéis/componentes administrativos, layout mobile-first, campos rotulados, foco visível, estados de carregamento/erro/vazio e área de toque mínima de 44px. Substituir cores hardcoded zinc da tela existente.
- Nenhuma migration deve ser necessária nesta abordagem, porque a estrutura embutida existente já suporta cargo, telefone, universidade, e as tabelas de preferências já existem. Migration só será proposta se a inspeção de dados mostrar um campo obrigatório sem representação possível.

### 3. Aviso obrigatório de incompatibilidade antes do disparo

- Inserir a análise no fluxo de confirmação do Mailer para os modos Individual e Multi; o modo de catálogo sem atleta não faz análise de fit por atleta.
- Atualizar os sinais ativos imediatamente antes de abrir a confirmação. Comparar todas as atletas efetivamente selecionadas a todos os coaches destinatários ativos, consolidando razões repetidas por coach e mostrando quais atletas foram afetadas.
- Regras de conflito:
  - `fully_recruited`: conflito para qualquer atleta da campanha.
  - `position_not_needed`: conflito se posição registrada pelo coach coincidir com a posição da atleta; sem posição registrada, conflito genérico para a campanha.
  - `other_positions_only`: se o coach informou posições procuradas, conflito quando as posições das atletas não estão nessa lista; se o coach não especificou posições, apresentar como “revisar — outras posições apenas”, sem afirmar uma correspondência exata.
  - `specific_athlete_dislike`: conflito para `athlete_id` coincidente; usar nome normalizado apenas como fallback quando o sinal não tiver ID.
  - Ignorar sinais expirados.
- A caixa mostrará uma contagem clara (“X coaches com conflitos de fit”), cada coach/universidade, atleta(s) impactadas e o motivo traduzido em texto simples. Preferências ambíguas ficarão separadas dos conflitos exatos.
- Oferecer **Voltar para revisar** e **Enviar mesmo assim**. O envio só começa após a confirmação explícita. Não remover destinatários nem atletas automaticamente e preservar o comportamento atual quando não há conflitos.
- Coaches suprimidos por opt-out continuarão excluídos pelo fluxo já existente; a caixa de fit não os contará como destinatários aptos nem permitirá contornar a supressão.
- Garantir que o estado pendente do aviso não chame o disparo duas vezes e que a confirmação final carregue a mesma seleção de destinatários/atletas validada.

### 4. Completar links sociais da assinatura

- Manter o `@goteamgoagency` clicável e apontando explicitamente para o perfil oficial `https://www.instagram.com/goteamgoagency/`.
- Adicionar linha de WhatsApp à assinatura HTML com o telefone formatado `+55 (11) 99923-9490`, apontando para `https://wa.me/5511999239490`.
- Atualizar as versões de texto puro do Mailer com Instagram e WhatsApp clicáveis por URL, para que as ações permaneçam disponíveis em clientes sem HTML.
- Como `renderSignature` é compartilhado, propagar a linha de WhatsApp a todos os templates que o reutilizam e verificar renderização móvel/desktop sem aumentar indevidamente a largura da assinatura.

## Arquivos e áreas prováveis

- `src/lib/email/athlete-board-card.ts`, `src/lib/email/recruit-email.ts`, `src/lib/email/recruit-email-template.ts`
- `src/routes/_authenticated/admin/mailer.tsx`, `src/lib/email/recruit-email.server.ts`, `src/lib/email/recruit-email.functions.ts`
- `src/routes/_authenticated/admin/coaches.tsx`, `src/routes/_authenticated/admin/universities.tsx`, navegação administrativa se necessário
- `src/components/send-recruit-email-dialog.tsx` e consumidores do envio legado
- `src/lib/email/email-brand.ts`, `src/lib/email/email-layout.ts` e renderizadores de texto puro
- tipos e testes unitários/integrados afetados; `CERNE.md` e `BACKLOGER.md` após implementação

## Critérios de aceite

1. O texto de `Seeking Opportunities For` aparece como `Available` no card em todos os modos de email e não se confunde com college start date.
2. Uma única tela dedicada lista/edita coaches associados às universidades; inclusão requer universidade; preferências são gerenciáveis ali e continuam no Mailer.
3. Coaches legados sem vínculo são identificáveis e podem ser associados sem perda dos registros preexistentes.
4. Antes do disparo de Individual/Multi, todo conflito ativo detectável gera confirmação com quantidade, coach, universidade, atleta e motivo; não há disparo antes do usuário confirmar.
5. Descadastros/supressões seguem bloqueados independentemente da confirmação de fit.
6. A assinatura HTML e texto puro inclui Instagram e WhatsApp clicáveis em todas as variantes usadas pelo Mailer.
7. As novas/alteradas telas cumprem os tokens, responsividade e acessibilidade de `UI&UX.md`; `package.json`, `bun.lock` e `vercel.json` permanecem intocados salvo necessidade aprovada.

## Validação planejada

- Cobertura de renderizador para `seeking_opportunities` e ausência de fallback para `college_start_date`.
- Cobertura da função pura de conflitos para cada motivo, sinais expirados, multi-atleta, destinatário suprimido e motivo de outras posições sem especificação.
- Cobertura de assinatura HTML/texto puro para destinos oficiais Instagram/WhatsApp.
- Após a implementação: `bun run typecheck`, `bun run lint`, testes relevantes e `bun run build` com Bun >= 1.3.14. Nenhuma dependência será instalada/atualizada sem ambiente Bun adequado.

## Status

**Aprovado pelo usuário em 2026-10-09. Implementação concluída.**

## Resultado da implementação

- `Available` agora recebe `seeking_opportunities` na query do Mailer e do envio no servidor, com linha omitida quando vazia e sem fallback para `college_start_date`. O texto puro também contém essa informação.
- `/admin/coaches` foi substituída por uma gestão dos coaches dentro de `universities.coaches`: cadastro/edição de nome, e-mail, telefone, cargo e universidade, remoção segura do vínculo, filtros, associação manual de registros legados sem apagá-los e gestão de sinais/supressões via server functions administrativas existentes. A tela mantém responsividade e tokens do design system. O envio legado pela tela de atleta agora também busca os coaches da universidade.
- O Mailer e o modal legado de envio pelo perfil da atleta recarregam sinais ativos e abrem confirmação antes do disparo, com coach, universidade, atleta(s), razão e indicação dos casos ambíguos. A decisão explícita `Enviar mesmo assim` é necessária; nenhuma seleção é removida automaticamente e bloqueios de unsubscribe continuam no servidor.
- Assinatura HTML e variantes de texto puro exibem Instagram e WhatsApp em link; telefone `+55 (11) 99923-9490` direciona para `https://wa.me/5511999239490`.
- Não foram criadas migrations nem modificados `package.json`, `bun.lock` ou `vercel.json`.

## Validação e limitação

- `git diff --check`: sem erros de whitespace.
- Build, typecheck, lint e testes não executados: Bun não está disponível e `node_modules` não existe no checkout; nenhuma instalação de dependência foi feita. A build de produção/Vercel permanece pendente de validação em ambiente com Bun >= 1.3.14 e dependências instaladas.
