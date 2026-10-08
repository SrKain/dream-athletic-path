# Plano — Diagnóstico e correção da build da Vercel após a reversão

**Data:** 2026-10-01 19:46 UTC  
**Solicitante:** Kauan (Usuário Humano)  
**Executor:** GitHub Copilot CLI  
**Status:** Aprovado pelo usuário após apresentação do log da Vercel

## 1. Contexto e objetivo

Após a reversão dos merges posteriores ao commit considerado correto
`dc9ad3fdbaa020d6ee7a691809b243e6bee52817`, a build da Vercel passou a falhar.
O objetivo é corrigir o contrato de instalação/build do projeto sem desfazer
novamente a reversão nem alterar funcionalidades da aplicação.

## 2. Evidências levantadas

- O `HEAD` atual é `429fed7` (`ajuste de reversão`), em `main`, sincronizado com
  `origin/main`; o worktree está limpo.
- Comparando `dc9ad3f` com o estado atual, não há diferenças nos arquivos da
  aplicação. As diferenças são registros documentais e o novo
  `package-lock.json`.
- O commit `429fed7` adicionou `package-lock.json`. O arquivo é incompatível
  com o `package.json` atual: não lista `xlsx`, registra `resend` em versão
  diferente e fixa versões diferentes para `@lovable.dev/vite-tanstack-config`
  e `nitro`.
- O `bun.lock` também diverge do `package.json`: sua lista raiz ainda inclui
  `@aws-sdk/client-sesv2`, removido do manifesto, além de conter o estado de
  dependências anterior. Portanto, uma instalação congelada do Bun pode
  interromper o deploy antes de executar o Vite.
- `vercel.json` declara `bun install` e `bun run build`, mas a configuração
  local do projeto não declara `packageManager`; o script `validate` ainda
  encadeia comandos com `npm run`, em desacordo com o README, que exige Bun.
- O ambiente desta investigação não tem Bun instalado. Não foi possível
  reproduzir localmente `bun install` ou `bun run build`.
- O check de GitHub consultado é somente o preview do Supabase; não expõe os
  logs da build da Vercel. Sem o log de falha, não é possível confirmar se a
  falha ocorre durante a instalação de dependências ou durante a compilação.

### Evidência posterior: log da implantação enviado pelo usuário

- A implantação iniciou em `429fed7` e a própria Vercel registrou:
  `Skipping build cache since Package Manager changed from "bun" to "npm"`.
- Apesar disso, o comando de instalação configurado executou Bun 1.3.14.
- `bun install` falhou antes de compilar, recebendo HTTP 403 ao buscar
  `@tanstack/react-start@1.168.48` e
  `@tanstack/start-server-core@1.169.30`.
- A Vercel identificou explicitamente `@tanstack/react-start@1.168.48` como
  vulnerável e recomendou atualização para uma versão corrigida.
- O registro npm consultado informa `@tanstack/react-start@1.168.60` como
  versão mais recente publicada no momento desta investigação; seus metadados
  declaram Node.js `>=22.12.0` e dependem de
  `@tanstack/start-server-core@1.169.39`.
- Logo, a causa imediata confirmada não é erro de compilação do código da
  aplicação: é o conjunto de dependências TanStack bloqueado na instalação.
  O lockfile npm adicional também explica a mudança de detecção de gerenciador
  e deve ser removido para deixar um único contrato de instalação.

## 3. Diagnóstico confirmado e critério de correção

O bloqueio ocorre na instalação, porque o lock Bun resolve versões TanStack
que a Vercel marca como vulneráveis e cujos tarballs retornam 403. O `bun.lock`
está desatualizado em relação ao manifesto. A presença adicional do
`package-lock.json` fez a Vercel reportar uma mudança de package manager, embora
tenha executado o comando customizado `bun install`.

Critério principal: atualizar o conjunto TanStack para versões corrigidas e
compatíveis, regenerar/sincronizar o lock Bun e obter instalação congelada
bem-sucedida; só então executar o build. Não alterar código da aplicação nem
configuração Nitro/Vite, pois o log falha antes dessa fase.

## 4. Escopo proposto

1. Elevar `@tanstack/react-start` para `^1.168.60`, atualmente publicado como
   release mais recente, e resolver as dependências TanStack transitivas para
   versões sem o bloqueio de vulnerabilidade. Não usar o bypass
   `DANGEROUSLY_DEPLOY_VULNERABLE_TANSTACK_START_XSS`.
2. Sincronizar `bun.lock` com o manifesto e confirmar que não restaram as
   versões bloqueadas (`react-start@1.168.48`,
   `start-server-core@1.169.30`).
3. Remover o `package-lock.json` conflitante, mantendo Bun como único gerenciador
   de dependências conforme a documentação do projeto.
4. Declarar `packageManager: "bun@1.3.14"` em `package.json` para tornar explícita
   a seleção do gerenciador.
5. Ajustar o script `validate` para encadear `bun run` em vez de `npm run`,
   mantendo os mesmos passos de validação.
6. Atualizar `engines.node` para `>=22.12.0`, mínimo requerido pelos metadados
   do release `@tanstack/react-start@1.168.60`.
7. Preservar `vercel.json` com `bun install`/`bun run build`.
8. Atualizar `CERNE.md` e `BACKLOGER.md` após a implementação.

Nenhum código da aplicação, migration ou histórico Git será alterado. Não será
feito reset, rebase, amend ou push sem solicitação explícita.

## 5. Riscos e alternativas

- A remoção do lockfile npm é adequada somente se o projeto continuar usando
  exclusivamente Bun, como determinam README e `vercel.json`.
- A atualização de TanStack precisa manter compatibilidade entre React Start,
  Router, Vite e o preset Nitro; regenerar o lock com Bun e revisar o diff,
  evitando upgrades não relacionados.
- Não se deve contornar o bloqueio de vulnerabilidade com variável de ambiente.
- Se a instalação congelada passar e o build ainda falhar, usar o novo erro da
  fase Vite/Nitro para diagnóstico adicional, sem mudanças especulativas.

## 6. Validação

- Confirmar que o único lockfile mantido é o `bun.lock`, que suas dependências
  raiz correspondem a `package.json` e que não contém as duas versões
  bloqueadas pelo log.
- Executar instalação limpa e congelada com Bun na versão exigida.
- Executar `bun run validate` e confirmar sucesso de lint, typecheck, testes e
  build.
- Verificar que o comando de build da Vercel continua sendo `bun run build` e
  que a saída `.output` é gerada.
- Registrar no `CERNE.md` e `BACKLOGER.md` a causa confirmada, os arquivos
  alterados e o resultado da validação.

## 7. Aprovação humana

Este plano foi registrado antes de ser apresentado. O usuário aprovou a
correção condicionada à confirmação e forneceu o log acima, que confirma a
falha na instalação e o bloqueio das versões vulneráveis. A implementação
autorizada deve seguir este escopo; nenhuma supressão do alerta de segurança é
permitida.
