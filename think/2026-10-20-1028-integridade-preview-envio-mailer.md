# Plano de solução — Integridade de composição, preview e envio do Mailer

- **Data:** 2026-10-20 (America/Sao_Paulo).
- **Repositório:** `SrKain/dream-athletic-path`, branch de referência `main`.
- **Solicitante:** usuário humano, responsável pelo projeto.
- **Executor da auditoria:** ChatGPT com GitHub e Supabase conectados.
- **Estado:** **APROVADO PELO SOLICITANTE; EM IMPLEMENTAÇÃO**.
- **Escopo da presente sessão:** leitura, inspeção estática e SQL somente leitura; sem modificações de código, dependências, banco, fila, campanhas ou disparos de e-mails.

## 1. Contexto, governança e evidência observada

Respeitar `README.md`, `AGENTS.md`, `CERNE.md`, `BACKLOGER.md`, `UI&UX.md`, `think/README.md` e as decisões históricas de Mailer presentes em `think/`. O plano deve preceder alterações e precisa de aprovação humana explícita; depois de qualquer mudança de código, registrar no CERNE e no BACKLOGER. Preservar histórico do Lovable, stack TanStack Start, Supabase externo, Resend e Bun 1.3.14; não editar `bun.lock` ou `package.json` sem necessidade aprovada.

Consulta somente leitura realizada em `teamgoteam`, cruzando `public.mailer_campaigns` e `public.mailer_queue` por `campaign_id` e inspecionando **somente métricas/indicadores estruturais do HTML e texto, sem copiar endereços ou fichas pessoais**. Um envio **single_athlete** de 2026-10-20 09:49 (Brasília), com um destinatário, terminou como `completed`/`sent`, obteve `provider_message_id` e registrou um ID de atleta na campanha e no payload. Entretanto, o HTML de 8.351 caracteres salvo antes do envio **não continha `QUICK FACTS` nem `VIEW FULL PROFILE`**; o texto plano de 963 caracteres tampouco continha `ABOUT HER` ou o CTA do atleta; mantinha a introdução e o fechamento padrão e a assinatura. Uma campanha de 2026-10-19 16:12 (Brasília) com três envios continha os cards e o CTA. É um defeito intermitente e localizado na construção do payload **antes** do Resend, não evidência de remoção pelo provedor. A presença do id do atleta no JSON não prova sua renderização.

## 2. Causas identificadas na implementação

### P0 — Seleção de atletas não sincroniza os blocos do composer

Em `src/routes/_authenticated/admin/mailer.tsx`, o efeito que inicializa `composerBlocks` (linhas aproximadas 805-816) retorna `prev` sempre que há blocos, mesmo após trocar ou reduzir `activeComposerAthleteIds`. Exemplo reproduzível pela lógica: ao iniciar com a atleta A, os blocos guardam `{type:"athlete",athleteId:A}`; ao selecionar B, o loader e o preview passam a receber os dados de B, **mas os blocos seguem referenciando A**.

Em `src/lib/email/personal-email-renderer.ts` (linhas aproximadas 235-324), `renderPersonalEmail` faz `byId.get(block.athleteId)`; na ausência, apenas registra `missingAthleteIds` e executa `continue`. O HTML é concluído com saudação, demais textos e assinatura, sem card, e os chamadores ignoram `missingAthleteIds`/`renderedAthleteIds`. Esse caminho explica diretamente a anatomia do payload ruim registrada no banco. O preview também usa blocos possivelmente defasados e não tem contrato de integridade verificável.

### P0 — Campos editáveis são ignorados quando `blocks` existe

Os campos `customHook` e `customIntroduction` de `mailer.tsx` são encaminhados à fila, mas `src/lib/email/recruit-email-template.ts`, na função `resolveLegacyBodyBlocks` (linhas aproximadas 150-176), faz `if (data.blocks?.length) return data.blocks`. Como o Mailer inicializa `composerBlocks` por padrão, o renderer ignora esses dois textos, ainda que a UI prometa que alteram o e-mail real. Isso também foi diagnosticado historicamente no plano `think/2026-10-09-1105-corrigir-composicao-mailer-e-cards.md`; a implementação atual continua exibindo a mesma ambiguidade.

### P0 — Validação de dados do atleta não é validação do e-mail final

`src/lib/email/mailer-queue.server.ts` exige determinados campos nos dados dos atletas, mas não rejeita blocos cujos IDs não pertencem à seleção. Depois persiste `subject`, `html` e `text` em `mailer_queue.payload` (linhas aproximadas 245-468), sem exigir que **todas as atletas selecionadas tenham sido renderizadas**. O worker (linhas 865-892) apenas envia o snapshot existente; por isso o envio pode ser bem-sucedido mesmo com conteúdo incompleto. Não mudar a política de retries/idempotência neste hotfix.

### P1 — Campos do catálogo têm semântica desconectada da apresentação

`src/lib/email/recruit-email-catalog-template.ts` usa `customHeadline` como fallback do **assunto** e não como título visual; recebe `customHook` mas não o insere na renderização. `customIntroduction` sobrepõe `customMessage`, o que pode ocultar um texto editado. A UI chama esses campos de headline, chamada e mensagem institucional. Esse ajuste deve ser coberto sem inserir cards de atletas no modo catálogo.

### Assunto do e-mail — verificar por teste, não supor perda

`customSubject` atravessa o formulário, o payload de fila e `resolveEmailSubject` no código, e `mailer_queue.subject` é utilizado no Resend. Não foi possível comparar a string que o usuário digitou com o disparo real, porque ela não existe em log separado do formulário. Portanto, **não é correto afirmar causa raiz confirmada para uma divergência do assunto**; incluir teste de paridade, rastreabilidade segura e captura de amostras autorizadas.

## 3. Arquitetura de correção

1. **Composição canônica única:** definir modelo tipado do rascunho com assunto, saudação automática por `last_name`, abertura/corpo editáveis, hook conforme posicionamento editorial aprovado, lista ordenada de IDs de atletas e fechamento institucional editável. Converter os campos da UI _uma vez_ para blocos canônicos. Manter adaptadores para chamadas antigas e catálogo, sem um segundo caminho que ignore campos.
2. **Reconciliação de seleção:** ao mudar atleta individual A→B, substituir a referência do card sem perder textos; no multi, remover IDs desmarcados, preservar ordem dos mantidos e inserir novos uma vez. Bloquear duplicatas e referências fora da seleção. Sincronizar as mesmas regras no servidor, não confiar no estado do navegador.
3. **Render determinístico e resultado verificável:** reutilizar o mesmo renderizador tipado para o preview e para o payload enfileirado; registrar `expectedAthleteIds`, `renderedAthleteIds`, `missingAthleteIds`, assunto e indicadores de inclusão de texto. Adaptar o renderer para retornar explicitamente falha ou lançar antes de persistir se um card selecionado não renderizou.
4. **Validação fail-closed no backend:** para `single_athlete` e `multi_athlete`, impedir criação/ativação de campanhas quando o conjunto renderizado não corresponde ao conjunto selecionado, quando um card obrigatório falta, quando o conteúdo principal foi perdido ou quando o HTML/texto final estão vazios ou divergentes em elementos fundamentais. Para catálogo, validar textos/campos específicos sem exigir atletas. Não descartar silenciosamente conteúdo editável.
5. **Paridade antes de disparar:** preview deve ser claramente identificado como amostra de coach; no botão de confirmação exibir assunto definitivo e resumo de cards/textos; idealmente oferecer prévia derivada de payload de servidor para um destinatário teste e checksum de versão, evitando que a seleção mude enquanto o usuário confirma.
6. **Correções do catálogo:** dar propósito visível e consistente para `headline`, `hook` e `message` em HTML/texto; assunto permanece campo separado. Migrar apenas apresentação/adapter, não dados persistidos ou campanhas históricas.
7. **Segurança/compatibilidade:** manter escaping de HTML, links de feedback, descadastro, assinatura, Reply-To, identidade visual, acessibilidade e mobile-first; não alterar orquestração browser-driven, micro-lotes, reserva SQL, rate limit, métricas, migrations ou Resend sem evidência de necessidade. Campanhas já enfileiradas contêm snapshots; **não reprocessar ou reenviar automaticamente**.

## 4. Arquivos previstos (sujeitos à revisão ao implementar)

- `src/routes/_authenticated/admin/mailer.tsx`: estado canônico, atualização na troca de atletas, campos editáveis, preview e guarda de envio.
- `src/lib/email/personal-email-renderer.ts`: resultado de integridade verificável, render de abertura/cards/fechamento.
- `src/lib/email/recruit-email-template.ts`: eliminar a prioridade ambígua entre `blocks` e `customOptions`; preservar adaptadores legados.
- `src/lib/email/mailer-queue.server.ts`: normalização e validação de payload no momento do enfileiramento, antes de gravar/ativar.
- `src/lib/email/recruit-email.server.ts`: mesma regra no disparo direto legado.
- `src/lib/email/recruit-email-catalog-template.ts`, `src/lib/email/recruit-email.ts`: catalog/headline/hook conforme contrato.
- Testes Vitest existentes em `src/lib/email/*.test.ts` e, se necessário, teste específico novo de reconciliação e payload completo.
- `CERNE.md`, `BACKLOGER.md`, este plano após aprovação/implementação.

Nenhuma migration ou alteração de dependência antecipada.

## 5. Matriz de regressão e aceitação

1. **Individual:** seleção A → B após carregar o preview; HTML e `text` enfileirados contêm somente B, com card, CTA, Quick Facts e bio/fit, sem A.
2. **Multi:** selecionar A+B → desmarcar A → adicionar C, inclusive troca rápida; cards B e C exatamente uma vez, preservando ordem, e nenhum card fantasma.
3. **Conteúdo editável:** alterar assunto, hook, corpo inicial, texto institucional e fechamento; verificar presença exata em preview, HTML real da fila, texto plano e objeto enviado ao cliente Resend simulado. Sem placeholders editoriais indevidos.
4. **Coaches:** dois sobrenomes diferentes, personalização por destinatário, texto sem duplicação de saudação e links seguros.
5. **Falhas:** ID de bloco ausente/não selecionado, campo essencial faltante, nulls, loading, erro de rede, caracteres especiais/XSS e seleção vazia. Resultado é bloqueio explícito antes do disparo; nenhuma campanha ativada e nenhuma chamada à API Resend.
6. **Catálogo:** assunto, headline visível, hook, mensagem em HTML/texto, sem cards; verificar que edições não se sobrepõem.
7. **Compatibilidade:** HTML mobile/desktop e clientes de e-mail, assinatura, Rodapé/Unsubscribe, idempotência, filtros, supressões, pause/resume/cancel; render completo sem clipping inesperado (alertar >90 KiB).
8. **Testes e deploy:** Bun 1.3.14; `bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`; CI em SHA de PR; staging/smoke com destinatário **controlado e autorizado** confirmando mensagem recebida (HTML e plain text) e valor final de assunto. Nenhum envio para coaches reais sem autorização explícita.

**Critério de aceite principal:** se preview mostra N atletas, o HTML e o texto preparados e persistidos para cada destinatário devem conter N atletas válidos, na ordem escolhida, e os textos editados; senão bloquear **antes** de colocar na fila.

## 6. Riscos, alternativas e controle de mudança

- **Risco principal:** remover/reordenar blocos pode apagar edições. Solução: reconciliação por ID estável e campos textuais fora da lista de cards.
- **Risco de regressão:** legado `sendRecruitEmailToCoaches`, modo catálogo e apresentações antigas. Manter adaptador compatível e testes.
- **Risco de produção:** a fila pode conter snapshots antigos incorretos; não corrigir filas existentes automaticamente nem reenviar campanhas enviadas. Eventual cancelamento de itens pendentes somente após inspeção/aprovação específica.
- **Alternativa rápida rejeitada:** forçar reconstrução de blocos padrão a cada troca; corrige o card mas apaga texto editado e não resolve ambiguidade dos campos.
- **Alternativa superficial rejeitada:** ajustar somente preview; HTML e texto persistidos continuariam errados.
- **Aprovação:** aguardando decisão humana; esta auditoria não concede autorização para alterar código, banco ou enviar e-mails.

## 7. Resultado desta sessão

Conexão ao GitHub confirmada; código, documentos e histórico de Mailer auditados; evidência somente leitura em `mailer_campaigns` e `mailer_queue` comprova e-mail aceito pelo Resend com conteúdo principal não renderizado. Plano salvo para revisão e execução posterior autorizada.

## 8. Plano aprovado para execução — 2026-10-20

Aprovação explícita: “Implement the proposed plan.” Branch `fix/2026-10-20-mailer-composition-integrity`, base `3aa3ae9`.

Decisões confirmadas: todos os modos (individual, multi e catálogo). Atletas: saudação automática → chamada → cards → texto institucional → assinatura. Catálogo: saudação → headline → chamada → ações → mensagem → assinatura. Campos vazios usam os padrões do modo; assunto independente da headline.

Implementar rascunho tipado/versionado por modo; blocos derivados da seleção, preservando textos e ordem. Trocas rápidas invalidam resultados antigos. Preparação autenticada de preview no servidor retorna conteúdo, integridade e fingerprint dos dados/rascunho/personalização/versão. Enfileiramento e envio direto usam a mesma preparação, conferem fingerprint quando originados da nova UI e validam todas as mensagens antes de qualquer gravação/envio. Adaptadores legados rejeitam referências ausentes/duplicadas/conflitantes, nunca descartam conteúdo silenciosamente. Não alterar snapshots existentes.

Cobrir A→B→C, multi A+B→B+C, seleção total, troca de modo preservando rascunhos, textos e assunto, catálogo, dois sobrenomes, erro/carregamento, seleção inválida, XSS, limites e versão desatualizada. Testes simulam provider e banco; sem envio real. Executar Bun 1.3.14 frozen install, typecheck, lint, test e build. Atualizar CERNE/BACKLOGER, entregar PR e exemplos HTML/texto. Preservar dependências, migrations, layout dos cards, textos canônicos, Reply-To e orquestração/idempotência.
