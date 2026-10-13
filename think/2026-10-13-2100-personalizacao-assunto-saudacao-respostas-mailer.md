# Personalização do assunto, saudação e respostas do Mailer

Data: 2026-10-13 21:00 UTC. Solicitante: usuário da sessão. Executor: Codex.
Status: aprovado explicitamente pelo usuário ("Aprovado") em 2026-10-13; implementado. Validação completa de build/tipos/lint pendente do ambiente Bun.

## Contexto e objetivo

O assunto multi-atleta é gerado automaticamente em recruit-email.ts. Não existe campo customSubject nos dados dos renderizadores consultados. A UI agrega first_name e last_name em um nome completo, perdendo o sobrenome como dado separado no destinatário. O renderer pessoal imprime blocos textuais sem personalização por coach. buildInterestedMailtoUrl usa EMAIL_SIGNATURE.name na saudação, acrescenta ano de formatura e assina Coach + coachName. buildNotAFitUrl só preenche o assunto. O card canônico consome esses helpers; existe outro helper de Not a Fit no renderer pessoal que deve ser alinhado.

## Escopo e comportamento proposto

1. Adicionar campo Assunto do e-mail no composer, para individual, multi-atleta e catálogo. Texto informado substitui o assunto automático; vazio mantém o assunto existente. Mostrar assunto no preview e preservar o mesmo valor no envio direto, enfileiramento e logs. Tratar título citado como assunto da mensagem, não título visual do card. Validar tamanho e impedir CR/LF no cabeçalho no servidor.
2. Tornar Saudação automática: Hi Coach [last_name], usando last_name cadastrado, inclusive sobrenome composto. Fallback Hi Coach, sem inventar sobrenome a partir do nome completo. Transportar campo separado da UI ao backend; preview mostra exemplo identificado. Evitar duplicar saudação nos blocos e cobrir entrada legada.
3. Resposta de interesse: usar exatamente o texto abaixo, substituindo nome/posição pelos dados do card clicado. Não incluir ano de formatura nem assinatura automática Coach [nome].

Hi Fabi,

I’m interested in recruiting Alice Cardoso (Middle Blocker) and would love to learn more about the next steps.

Please let me know how we can move forward.

Thank you!

4. Resposta Not a Fit: preencher corpo com o texto abaixo, também com nome/posição dinâmicos e sem assinatura automática. Preservar assunto contextual e endereço de contato existente.

Hi Fabi,

Alice Cardoso (Middle Blocker) is not the right fit for us at this time. Please keep us posted on future players.

Thank you!

Sem posição cadastrada, omitir os parênteses em vez de inventar uma posição. Codificar assunto/corpo em mailto com encodeURIComponent para preservar quebras de linha, apóstrofo e caracteres especiais. Cada atleta do e-mail multi possui sua própria resposta.

## Arquivos e etapas

Concluir leitura integral obrigatória da documentação antes de decisões de implementação. Obter checkout da versão atual e consultar AGENTS adicionais. Registrar este plano e a demanda no checkout/branch de trabalho.

Áreas previstas: src/routes/_authenticated/admin/mailer.tsx; src/lib/email/recruit-email.ts; recruit-email-template.ts; recruit-email-catalog-template.ts; personal-email-renderer.ts; athlete-board-card.ts; recruit-email.server.ts; mailer-queue.server.ts; recruit-email.functions.ts; tipos de destinatários/composição e consumidores legados. Atualizar CERNE.md e BACKLOGER.md ao implementar.

Não é necessária migration prevista: last_name já existe em universities.coaches e assunto/corpo já são persistidos na fila. Não alterar dependências nem lock para essa entrega.

## Validação

Testes relevantes: assunto informado/automático e sanitização de cabeçalhos; saudação por dois coaches diferentes e sobrenome ausente/composto; corpo decodificado dos dois mailto exatamente conforme pedido; nome/posição de cada atleta em multi; propagação do assunto/saudação ao caminho de fila e envio legado; preview HTML/texto compatível com envio. Rodar lint, typecheck, testes e build com Bun conforme governança. Se o ambiente permanecer bloqueado, informar quais verificações não puderam rodar.

## Riscos e limites

Links mailto abrem composição no cliente do destinatário, que pode acrescentar sua própria assinatura. A aplicação deixará de acrescentar Coach [nome]. Campanhas já enfileiradas contêm HTML pronto; a alteração se aplica aos novos envios, sem reescrever campanhas existentes.

## Aprovação

Aprovação recebida do usuário: "Aprovado". Implementação concluída em branch de revisão; sem merge/deploy. Campanhas antigas não foram alteradas.


## Resultado e validação da implementação

- Campo de assunto comum aos três modos, com prévia do assunto final e identificação do coach de exemplo/selecionado.
- last_name transportado separadamente ao renderer, envio direto, fila e adaptação de envio legado. Saudação é automática e somente leitura no composer.
- Respostas de interesse e Not a Fit contêm os textos aprovados, com atleta/posição dinâmicos e sem assinatura automática do coach; helper do rodapé alinhado ao card.
- 11 testes novos de personalização passaram sob executor Node 24 com remoção nativa de tipos e adaptador local da interface describe/it. Não equivale a executar Vitest.
- Verificação complementar executou funções reais sendMailerEmails/enqueueCampaignDispatches com banco e Resend simulados: individual/multi/catálogo x envio direto/fila (6 casos), dois sobrenomes por caso, assunto/campanha/logs persistidos e rejeição de CR/LF antes de efeitos externos.
- Suíte antiga recruit-email-multi: 13/15 passaram sob adaptador Node; duas falhas também reproduzidas no snapshot original af9b408: expectativas de ações legadas no adaptador e whitelist de cores. Não foram corrigidas nesta demanda.
- Novas verificações de propagação adicionadas às suítes Vitest de envio e fila; não executadas pelo Vitest neste ambiente.
- git diff --check passou. Bun, node_modules, typecheck, lint, build e verificação visual da UI não disponíveis/realizados. Nada foi enviado a coaches; nenhuma migration foi aplicada.
