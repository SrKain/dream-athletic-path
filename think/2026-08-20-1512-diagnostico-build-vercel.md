# Plano de Solução: Diagnóstico e Correção de Erro de Build na Vercel (Falta do pacote `destr` / `nitro`)

## 1. Contexto e Objetivo

No deploy da Vercel para o commit `f4e48fe`, a etapa de build falhou com o seguinte erro:
```
Error: [@lovable.dev/vite-tanstack-config] an explicit `nitro` option ({ ... }) was set in vite.config.ts, but the `nitro` package isn't installed. Add `nitro` to your devDependencies (matches peerDependency >=3.0.260429-beta). Original import error: Cannot find package 'destr' imported from /vercel/path0/node_modules/unstorage/dist/index.mjs
```

### Causa Raiz
O pacote `@lovable.dev/vite-tanstack-config` ativa a integração com o Nitro (preset `vercel` definido no `vite.config.ts`).
O `nitro` v3 depende do `unstorage`, que realiza importação direta do pacote `destr`.
No commit `f4e48fe` no GitHub, o `package.json` não declarava explicitamente `destr` em `devDependencies`. Quando a Vercel executou `bun install` isoladamente, o pacote `destr` não foi instalado/hoisteado para o módulo `unstorage`, gerando falha de importação no carregamento do `vite.config.ts`.

## 2. Escopo e Arquivos Afetados
- `package.json`: inclusão explícita de `destr` e `nitro` em `devDependencies`.
- `BACKLOGER.md`: registro da solicitação e diagnóstico.
- `CERNE.md`: documentação das dependências e configuração de build da Vercel.

## 3. Etapas de Implementação / Resolução
1. **Adicionar dependências no `package.json`**:
   - `"destr": "^2.0.5"`
   - `"nitro": "^3.0.260610-beta"`
2. **Validar compilação local**:
   - Execução de `compile_applet` (executa `vite build` com o preset Nitro da Vercel) para garantir que a geração de bundles e rotas do TanStack Start ocorra sem erros.
3. **Orientação para o usuário**:
   - Informar que a correção já está aplicada no `package.json`. Para a Vercel compilar com sucesso, basta commitar/sincronizar as alterações com o repositório GitHub (`git push`), acionando um novo build na Vercel.

## 4. Impactos e Riscos
- Risco zero: `destr` é uma biblioteca pura e leve de deserialização JSON/strings utilizada internamente pelo ecossistema UnJS (Nitro/Unstorage).
- Não altera nenhuma rota, componente ou regra de negócio da aplicação.

## 5. Estratégia de Validação
- `npm run lint` / `eslint .`: 0 erros.
- `compile_applet` (`vite build`): compilação concluída com sucesso (código de saída 0).
