# Plano — Reverter commits posteriores ao último estado correto

- **Data/Hora:** 2026-10-01 19:21 UTC
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** GitHub Copilot CLI
- **Status:** Concluído após aprovação humana explícita

## 1. Contexto e objetivo

O usuário informou que o último commit correto é
`dc9ad3fdbaa020d6ee7a691809b243e6bee52817`. A branch `main` está atualmente
nesse repositório em `4ec4269d2393f5fa213579b6bedf6ebdfe9212e2`, sincronizada
com `origin/main`. Há cinco commits posteriores alcançáveis a partir do ponto
indicado, agrupados em dois merges na linha principal:

1. `d939ef26c565d28f9398605aa64465d77183ec23` — merge `Traduziu app para English US`, com primeiro pai `dc9ad3f` e segundo pai `154f1f2`.
2. `4ec4269d2393f5fa213579b6bedf6ebdfe9212e2` — merge `Update plan`, com primeiro pai `d939ef2` e segundo pai `762818d`.

O diff acumulado entre o commit indicado e `HEAD` abrange 136 arquivos, com
remoções e alterações extensas, inclusive migrations, telas, serviços de
e-mail, documentação e planos.

## 2. Escopo e arquivos

- Desfazer os dois merges na linha principal usando `git revert -m 1`, em
  ordem inversa, preservando os primeiros pais e removendo o conteúdo agregado
  após `dc9ad3fdbaa020d6ee7a691809b243e6bee52817`.
- Preservar o histórico publicado usando `git revert`, sem reset, amend,
  rebase, squash ou force push.
- Preservar o arquivo não rastreado preexistente `package-lock.json`.
- Após aprovação e execução, registrar a tarefa no `BACKLOGER.md` e documentar
  o resultado em `CERNE.md`.

## 3. Etapas

1. Reverter o merge `4ec4269` com o primeiro pai como linha principal.
2. Reverter o merge `d939ef2` com o primeiro pai como linha principal.
3. Se ocorrer conflito, interromper a sequência e informar os arquivos
   envolvidos antes de decidir como resolvê-los.
4. Confirmar que os arquivos rastreados correspondem ao estado do commit
   informado e que `package-lock.json` continua preservado.
5. Atualizar o registro de tarefas e a documentação viva; não enviar/pushar
   alterações ao GitHub sem solicitação explícita.

## 4. Impactos, riscos e alternativas

- A reversão remove do estado atual todas as alterações rastreadas agregadas
  pelos dois merges, incluindo funcionalidades e migrations. Isso pode
  afetar comportamento e compatibilidade com alterações já aplicadas no
  Supabase; o rollback local do Git não desfaz migrations remotas.
- `git revert` preserva o histórico, ao contrário de mover a branch para trás
  com reset. Cada reversão pode exigir resolução de conflitos.
- Não serão apagados dados remotos nem executadas migrations inversas.
- O arquivo `package-lock.json` está fora do histórico rastreado e será mantido.

## 5. Validação

- Verificar a sequência do histórico de reversão e comparar o conteúdo
  rastreado final com o commit de referência.
- Confirmar que o worktree não perdeu o `package-lock.json` preexistente.
- Executar validações do projeto apenas se as dependências e ambiente
  disponíveis permitirem; registrar limitações sem alterar arquivos fora do
  escopo.

## 6. Aprovação humana e resultado

- **Aprovação:** Aprovado pelo usuário em 2026-10-01.
- **Resultado:** Revertidos os merges `4ec4269` e `d939ef2`, preservando a linha
  principal. Os commits criados foram `40efa5b` e `7500698`. A comparação
  inicial confirmou que o conteúdo rastreado voltou a corresponder exatamente
  ao commit de referência. Nenhum push foi feito; `package-lock.json` foi
  preservado.
- **Limitação:** A reversão do Git não reverte nem altera migrations já
  aplicadas no Supabase externo.
