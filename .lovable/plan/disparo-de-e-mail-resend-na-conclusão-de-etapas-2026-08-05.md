# Disparo de e-mail (Resend) na conclusão de etapas

Ativar os envios de celebração usando a **sua** conta Resend, disparados quando a agência marca uma etapa como **Concluída** na timeline do atleta.

## O que já existe

- Serviço central de e-mail com Resend, log em `email_log` e agendamento por janela de envio.
- Template premium de celebração e substituição de placeholders (`{{athlete_name}}`, `{{new_stage}}`, etc.).
- Migration `0007` com o campo de mensagem de celebração por etapa.

## O que falta (e será feito)

1. **Conectar o gatilho.** Hoje a timeline salva a etapa direto no banco e nunca chama o e-mail. Ao marcar uma etapa como _Concluída_, a timeline passará a chamar a função de servidor de celebração (etapa anterior → etapa concluída). Falha de e-mail nunca bloqueia o salvamento da etapa.
2. **Corrigir a função de servidor.** `stage-change.server.ts` está com API antiga e em arquivo que a tela não pode importar; vira `src/lib/email/stage-change.functions.ts` com `inputValidator`, protegida por middleware de agência (só a agência dispara), lendo dados sensíveis apenas no servidor.
3. **Anti-duplicidade.** Antes de enviar, consulta `email_log` pelo par atleta+etapa; se já houve envio/agendamento para aquela etapa, não reenvia.
4. **Link do portal.** Passa a usar `APP_URL` (a variável usada no resto do projeto) em vez de `VITE_APP_URL`.
5. **Janela de envio mantida.** Fora do horário, o envio é agendado no Resend para a próxima janela e registrado como `scheduled`.
6. **Feedback na tela.** Ao concluir a etapa, a agência vê um aviso: e-mail enviado, agendado (com o horário) ou ignorado (etapa sem mensagem configurada / atleta sem e-mail).
7. **Configuração da mensagem por etapa.** Conferir/ligar o campo de mensagem de celebração na tela de Pipeline, com a lista de placeholders disponíveis, para que cada etapa tenha seu texto.

## Configuração necessária (sua parte)

- `RESEND_API_KEY` — você me envia e eu guardo com segurança (nunca vai ao navegador).
- `EMAIL_FROM` — precisa de um domínio verificado no Resend. Enquanto você não configurar o seu domínio, deixamos `onboarding@resend.dev`, que **só entrega para o e-mail dono da conta Resend** — serve para testar. Depois de verificar seu domínio, trocamos para algo como `Go Team Go <no-reply@seudominio.com>`.
- `APP_URL` — URL pública (Vercel) usada no botão do e-mail.
- Confirmar que a migration `0007` já foi aplicada no seu Supabase (campos `celebration_message_en` e `email_log.scheduled_for`).

## Notas técnicas

- Chamada via `useServerFn` no `stage-timeline.tsx`, apenas no modo editável (admin).
- Chaves lidas somente dentro do handler (`process.env`), cliente admin do Supabase apenas para leitura de atleta/etapa/agência e escrita em `email_log`.
- Após a implementação: atualizar `CERNE.md` e registrar a tarefa em `BACKLOGER.md`.
