# Plano — Alinhamento de versões TanStack para concluir a build da Vercel

- **Data/Hora:** 2026-10-02 02:04 UTC
- **Solicitante:** Usuário Humano
- **Executor:** GitHub Copilot CLI
- **Status:** Concluído após aprovação do ajuste adicional de tipo e validação integral.

## 1. Contexto e objetivo

O log original da Vercel falhou durante a instalação, porque versões antigas
de `@tanstack/react-start` e `@tanstack/start-server-core` recebiam HTTP 403 e
eram sinalizadas como vulneráveis. A correção anterior foi aplicada no commit
local `8cd6be0`, ainda não enviado para `origin/main`: atualizou React Start,
sincronizou o `bun.lock`, removeu o lockfile npm concorrente e fixou Bun/Node.

A validação local atual confirma que `bun install --frozen-lockfile` passa,
mas a build agora alcança a etapa Vite/Nitro e falha com:

```text
"makeSerovalPlugin" is not exported by
"node_modules/@tanstack/router-core/dist/esm/ssr/client.js"
```

O lockfile e os metadados instalados confirmam versões TanStack desalinhadas:
as dependências diretas resolvem `@tanstack/react-router@1.170.31` e
`@tanstack/router-plugin@1.168.34`, enquanto React Start `1.168.60` usa
React Router `1.170.41` e seu `start-plugin-core@1.171.49` usa
`router-plugin@1.168.42`, todos esses componentes usando `router-core@1.171.34`.
As versões diretas mais antigas também trazem `router-core@1.171.26`, que não
exporta o helper importado pelo bundle SSR.

## 2. Escopo e arquivos afetados

- `package.json`: alinhar as dependências diretas `@tanstack/react-router` e
  `@tanstack/router-plugin` às versões usadas pela cadeia de React Start
  (`^1.170.41` e `^1.168.42`, respectivamente).
- `bun.lock`: regenerar com Bun 1.3.14 e confirmar resolução coerente do
  conjunto Router/Start, removendo o core antigo que causa a incompatibilidade
  no bundle SSR.
- `src/routes/__root.tsx`: apareceu uma incompatibilidade de tipo decorrente
  do Router alinhado. O componente de erro raiz anota `error` como `Error`,
  mas o contrato atual do Router fornece `unknown`; após aprovação adicional,
  ampliar a anotação para `unknown`, que já é aceito por `console.error` e
  `reportLovableError`.
- `CERNE.md` e `BACKLOGER.md`: registrar a correção e os resultados depois da
  implementação.
- Nenhuma outra funcionalidade ou arquivo da aplicação, migration,
  configuração Nitro/Vite, nem histórico Git será alterado. Sem push
  automático.

## 3. Etapas de implementação

1. Atualizar as duas dependências diretas TanStack indicadas, sem usar
   substituição forçada ou variável de bypass.
2. Regenerar o lockfile somente pelo Bun, mantendo Bun como package manager
   único.
3. Conferir as versões efetivamente instaladas e os metadados dos pacotes,
   especialmente que os pacotes Router/Start convergem em versões compatíveis
   de `router-core` e que `makeSerovalPlugin` está exportado.
4. Atualizar a anotação do parâmetro `error` no `ErrorComponent` raiz de
   `Error` para `unknown`, compatibilizando-a com `ErrorComponentProps` sem
   assumir que todo valor reportado seja instância de `Error`.
5. Executar `bun install --frozen-lockfile` para verificar instalação
   reprodutível.
6. Executar `bun run validate` para testar lint, tipagem, testes e build.
7. Atualizar `CERNE.md` e o status de `BACKLOGER.md` com resultados reais,
   inclusive avisos ou limitações não bloqueantes.

## 4. Impactos, riscos e alternativas

- O alinhamento das dependências atualiza as versões efetivas do Router e do
  plugin no runtime/build; a correção de tipo proposta não altera o
  comportamento visual do componente de erro.
- Há risco de surgir outro erro de compatibilidade depois de corrigir o
  primeiro. Nesse caso, usar o próximo erro concreto em vez de adicionar
  overrides especulativos.
- Não manter versões divergentes apenas para evitar uma atualização mínima
  necessária à compatibilidade.
- Não definir
  `DANGEROUSLY_DEPLOY_VULNERABLE_TANSTACK_START_XSS=1`; o aviso de
  vulnerabilidade precisa permanecer resolvido pela atualização do pacote.
- Não alterar funcionalidades da aplicação, apagar dados remotos, nem
  reescrever ou enviar commits ao histórico remoto.

## 5. Estratégia de validação

- `bun install --frozen-lockfile`.
- Confirmar pela resolução instalada e pelo lockfile que React Start, React
  Router, Router Plugin e Router Core formam uma cadeia compatível e não usam
  o conjunto antigo conflitante.
- Confirmar que o tipo do componente de erro raiz aceita o contrato `unknown`
  do Router.
- `bun run validate`, cujo build deve gerar `.output` sem o erro de export do
  `makeSerovalPlugin`.
- Revisar `git diff` para confirmar que as mudanças se limitam ao manifesto,
  lockfile, ajuste aprovado em `src/routes/__root.tsx` e documentação
  acordada.

## 6. Aprovação humana e resultado

- **Aprovação:** O usuário aprovou explicitamente a implementação do plano
  original em 2026-10-02 02:08 UTC e, após a validação inicial revelar o
  contrato `unknown` para o erro de rota, aprovou o ajuste complementar em
  2026-10-02 02:14 UTC.
- **Resultado:** `package.json` alinhado para React Router `^1.170.41` e
  Router Plugin `^1.168.42`; lockfile regenerado por Bun 1.3.14, com
  `router-core@1.171.34`. `src/routes/__root.tsx` tipa `error` como `unknown`,
  compatível com TanStack Router. Instalação congelada passa; `makeSerovalPlugin`
  está exportado; `bun run validate` passou integralmente: ESLint sem erros
  (10 warnings), typecheck, 138 testes em 19 arquivos e build de produção.
  Foram observados avisos não bloqueantes de `"use client"` nas dependências
  durante a build. Não houve deploy remoto, push ou commit.
