# TASK-093 — Not a fit por resposta e preferências manuais de coaches

## Contexto e objetivo

O usuário quer manter a página pública `/feedback` como está e aprimorar o tratamento de preferências de coaches. O botão `NOT A FIT` dos emails deve abrir a resposta do email sem assunto ou corpo pré-preenchidos. Na tela de Universidades, a agência também deve conseguir escolher um coach cadastrado e gravar manualmente tanto sinais de fit quanto preferências de comunicação.

## Diagnóstico atual

- `src/lib/email/recruit-email.ts` monta o destino de `NOT A FIT` como uma URL para `/feedback`; há consumidores nos emails de atleta e no card do Mailer.
- `src/lib/email/personal-email-renderer.ts` também aponta o link equivalente do email pessoal à rota `/feedback`.
- A página `src/routes/feedback.tsx` é um formulário público já existente para sinais de fit. Deve permanecer visual e funcionalmente intacta.
- `coach_interest_signals` já armazena os quatro motivos (`position_not_needed`, `fully_recruited`, `other_positions_only`, `specific_athlete_dislike`), coach/email, atleta/posição, observações e validade de seis meses. O Mailer consome sinais ativos como alertas contextuais.
- `email_suppressions` armazena pausas de seis meses ou supressão permanente. `getSuppressedEmailSet()` já impede o envio a e-mails com supressão ativa.
- A tela `src/routes/_authenticated/admin/universities.tsx` edita coaches como parte do cadastro/edição da universidade, mas não tem gestão das preferências desses coaches.

## Plano proposto

### 1. Alterar o CTA `NOT A FIT` para resposta por email

- Substituir os destinos de `/feedback` usados especificamente por `NOT A FIT` por `mailto:` para o endereço oficial de resposta/recrutamento da agência.
- Preencher um assunto curto relacionado à ação e à atleta, por exemplo `Not a fit: Maria Eduarda Terra`, usando o nome da atleta do card. Não preencher o corpo do email; o usuário final decide o que escrever.
- Configurar o cabeçalho `Reply-To` dos envios do Mailer para o mesmo endereço, de modo que respostas comuns ao email também cheguem ao contato da agência.
- Preservar os destinos e a lógica de `VIEW FULL PROFILE`, `RECRUIT NOW`, unsubscribe e o link independente de feedback/posição quando existir.
- Preservar a página `/feedback` sem mudança. Ela continua acessível pelo link de feedback próprio, mas deixa de ser o destino do botão `NOT A FIT`.
- Compatibilidade importante: links de email não conseguem acionar a função “responder a esta mensagem” do cliente de email nem garantir threading. Um `mailto:` sem campos pré-preenchidos abre uma nova mensagem ao endereço `Reply-To`; será descrito no botão/UX de forma honesta como contato por resposta.
- Como esse clique deixa de registrar automaticamente um sinal no sistema, o registro manual na seção seguinte será o caminho administrativo para gravar a preferência reportada por email/telefone.

### 2. Adicionar gestão de preferências na área de coaches da Universidade

- Manter seleção contextual da universidade e do coach já cadastrado; mostrar nome e email selecionados para evitar aplicar uma preferência ao destinatário errado.
- Acrescentar uma área compacta de preferências do coach no fluxo de edição/visualização de universidade, com formulário para registrar os motivos de fit já suportados pelo sistema:
  - roster completo;
  - posição não necessária;
  - interesse em outras posições específicas;
  - atleta específica não é fit.
- Permitir posição, atleta (quando aplicável), observação e validade/data de expiração onde fizer sentido, reaproveitando o modelo existente de `coach_interest_signals` e seus seis meses padrão.
- Acrescentar preferências de comunicação: pausa temporária de seis meses ou bloqueio permanente. Registrar em `email_suppressions`, que já é consultada pelo Mailer antes do envio.
- Mostrar estado atual e histórico relevante do coach: motivo, observação, validade/expiração e estado de comunicação, com ações administrativas para encerrar/atualizar uma preferência conforme suporte seguro do schema atual.
- Ao salvar/alterar dados do coach, associar sinais e suppressions pelo email normalizado e `coach_id` da entrada JSON da universidade. Se o email mudar, exibir e preservar claramente o vínculo histórico; não migrar silenciosamente preferências entre endereços.
- Proteger as operações através de server functions autenticadas com `requireAgency`; validar email, razão, validade e valores aceitos no servidor. Não conceder gravação administrativa pública.
- Reutilizar as tabelas atuais se confirmadas suficientes. Só propor migration se inspeção do schema/casos de edição revelar que não é possível relacionar com segurança preferências, coaches ou encerramento de registros existentes.

### 3. Interação com Mailer e salvaguardas

- Suppressions ativas permanecem como bloqueio absoluto de envio, incluindo a seleção manual pelo administrador; expirada temporária volta a permitir contato conforme regra atual.
- Sinais de fit continuam distintos de descadastro. Exibi-los como alertas/preferências para decisão da agência, sem converter automaticamente preferência de posição em opt-out total.
- Confirmar no Mailer que coach suprimido continua excluído e que sinais ativos aparecem para seleção contextual, sem afetar outro coach da mesma universidade.
- Manter o fluxo `/feedback` e o unsubscribe em 2 níveis operacionais.

### 4. UI/UX e acessibilidade

- Seguir `UI&UX.md`: componentes e tokens administrativos atuais, mobile-first, labels explícitos, estados de carregamento/sucesso/erro e confirmação para bloqueio permanente.
- Não alterar o desenho ou campos atuais da tela pública `/feedback`.
- Diferenciar visualmente “preferência de atleta/posição” de “não deseja receber comunicações”, com explicação de que o segundo bloqueia disparos do Mailer.

## Arquivos previstos

- `src/lib/email/recruit-email.ts`
- `src/lib/email/personal-email-renderer.ts`
- `src/lib/email/recruit-email.server.ts` e `src/lib/email/recruit-email.functions.ts`
- `src/routes/_authenticated/admin/universities.tsx`
- possivelmente `src/types/db.ts` e migration SQL, apenas se requisito de schema for confirmado durante implementação
- testes relevantes de renderização, autorização e comportamento de preferências
- `CERNE.md` e `BACKLOGER.md` após implementação

## Critérios de aceite

1. `NOT A FIT` abre composição endereçada ao contato de resposta da agência, com assunto `Not a fit: [athlete name]` e corpo vazio.
2. Emails enviados têm `Reply-To` correspondente.
3. `/feedback` permanece inalterada e disponível; links de unsubscribe continuam independentes.
4. Admin pode escolher coach de uma universidade e adicionar qualquer um dos quatro sinais suportados, com contexto opcional de posição/atleta e observação.
5. Admin pode cadastrar pausa de seis meses ou bloqueio permanente para aquele coach; email suprimido não é incluído em disparos.
6. Preferências e seus prazos aparecem claramente na gestão do coach; operações só são autorizadas no servidor para agência.
7. Um sinal de fit não se transforma em opt-out total.
8. Build/validações da Vercel e arquivos de package/deploy permanecem preservados; validar com Bun >= 1.3.14 e ferramentas disponíveis após aprovação.

## Riscos e decisão técnica

Um link HTML de email não pode executar a ação nativa “Reply” nem estabelecer threading no cliente do destinatário. A implementação viável sem formulário é um link `mailto:` para o endereço de resposta configurado, com assunto contextualizado pela atleta e corpo vazio. O clique também não grava automaticamente “not a fit”; a gravação manual solicitada na tela de Universidades dá controle à agência sem inventar tracking por abertura/clique.

## Implementação concluída

- Botões `NOT A FIT` dos cards, do bloco antigo de feedback e do rodapé de emails pessoais abrem `mailto:contact@goteamgoagency.com` com assunto `Not a fit: [athlete name]` e sem corpo pré-preenchido.
- O Mailer define o mesmo endereço de resposta via `Reply-To` nos envios em lote e nos envios individuais de fallback.
- A rota pública `/feedback` não foi modificada e continua registrada; unsubscribe permanece separado.
- A edição de universidades agora oferece painel expansível por coach salvo. Permite criar os quatro sinais existentes com posição/atleta/observações opcionais, consultar histórico/expiração e encerrar sinais ativos.
- O painel também permite pausa de seis meses ou bloqueio permanente por email. Bloqueios manuais podem ser atualizados/removidos; descadastros e bloqueios automáticos preexistentes são protegidos contra alteração. O Mailer continua excluindo emails com supressão ativa.
- As operações administrativas novas exigem `requireAgency`; as tabelas existentes foram suficientes, sem migration.
- `git diff --check` concluído sem erros de whitespace. Typecheck/build não foram executados porque Bun e `node_modules` não estão disponíveis no ambiente. Nenhum arquivo de dependências/deploy foi alterado.

## Status

Implementação entregue após aprovação do usuário.
