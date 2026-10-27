# Restauração do bun.lock Canônico (11e32ea) & Recuperação da Build Vercel

Plano para recuperar a build da Vercel após a divergência introduzida no commit `67551be`, restaurando o `bun.lock` ao blob canônico `11e32ea0199fd8ea03742194d7e92136aa0ed513`, reforçando as regras de governança do `AGENTS.md` e endurecendo o teste `lockfile-sync.test.ts`.

### User Review & Critical Decisions

> [!IMPORTANT]
> O usuário confirmou as seguintes decisões nas perguntas de alinhamento:
> - **Escopo de Arquivos no Commit:** Incluir `bun.lock`, `AGENTS.md`, `src/lib/lockfile-sync.test.ts`, `BACKLOGER.md` e `CERNE.md`.
> - **Endurecimento de Teste:** Endurecer o teste `src/lib/lockfile-sync.test.ts` nesta mesma entrega para comparar explicitamente as versões exatas de `@lovable.dev/vite-tanstack-config` e `nitro`.

- **Decisão Confirmada 1**: O arquivo `bun.lock` será restaurado estritamente a partir do blob canônico `11e32ea0199fd8ea03742194d7e92136aa0ed513` idêntico ao commit `8651da0`. Nenhum `bun install` mutante ou `bun update` será executado.
- **Decisão Confirmada 2**: O `package.json` permanece rigorosamente intocado (`@lovable.dev/vite-tanstack-config: 2.25.3`, `nitro: 3.0.260603-beta`).
- **Decisão Confirmada 3**: A regra 7 do `AGENTS.md` terá seu recuo original restaurado e receberá a diretriz preventiva mandatória para impedir que agentes modifiquem `bun.lock` e `package.json`.

---

### 1. Overview & Core Concept

- **O que faz**: Corrige a falha `"error: lockfile had changes, but lockfile is frozen"` na pipeline de CI/CD da Vercel ao restaurar o lockfile canônico e previne regressões futuras com asserções estritas e regras de governança.
- **Público-alvo**: Time de engenharia e agentes de IA que atuam no repositório `SrKain/dream-athletic-path`.
- **Benefício Chave**: Builds 100% determinísticas e verdes na Vercel com Bun 1.3.14 sem divergência de lockfile.

---

### 2. User Experience & Developer Workflow

O fluxo de CI/CD e governança passa a operar com proteção em múltiplas camadas:

```
┌────────────────────────────────────────────────────────┐
│                   Desenvolvedor / IA                   │
│         Edita código da aplicação sem tocar lock       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               Guarda Local (Vitest)                    │
│      src/lib/lockfile-sync.test.ts compara             │
│      package.json <=> bun.lock (@lovable.dev & nitro)  │
└───────────────────────────┬────────────────────────────┘
                            │ Se verde (0 drifts)
                            ▼
┌────────────────────────────────────────────────────────┐
│               Portão Anti-Build-Quebrada               │
│          typecheck + lint + test + build = 0           │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               Deploy Vercel (CI)                       │
│     bun install --frozen-lockfile (PASS 100% VERDE)   │
└────────────────────────────────────────────────────────┘
```

---

### 3. Key Decisions & Rationale

- **Decisão 1: Restauração byte a byte do blob `11e32ea`**
  - *Abordagem*: Utilizar o conteúdo exato do blob `11e32ea0199fd8ea03742194d7e92136aa0ed513` do commit validado `8651da0`.
  - *Por quê*: Garante paridade total com o `package.json` atual sem riscos de alteração pelo runtime do Bun local (v1.4.4).
- **Decisão 2: Endurecimento explícito do `lockfile-sync.test.ts`**
  - *Abordagem*: Adicionar uma asserção dedicada que valida as chaves `@lovable.dev/vite-tanstack-config` e `nitro` diretamente contra o workspace raiz do lockfile.
  - *Por quê*: Impede qualquer tentativa futura de commit acidental com lockfile defasado.
- **Decisão 3: Reforço Preventivo no `AGENTS.md`**
  - *Abordagem*: Adicionar a regra: `"Agentes de IA NUNCA modificam bun.lock nem package.json. Se uma tarefa exigir mudança de dependência, PARE e peça ao humano. Antes de todo commit, rode git diff --name-only e remova bun.lock/package.json do staging se aparecerem."`
  - *Por quê*: Fecha a brecha comportamental onde agentes executavam comandos que alteravam o lockfile sem necessidade.

---

### 4. Technical Verification & Output Logging

1. **Restauração do `bun.lock`**:
   - Garantir que o SHA do blob seja `11e32ea0199fd8ea03742194d7e92136aa0ed513`.
2. **Atualização do `AGENTS.md`**:
   - Linha 30 desindentada e diretriz preventiva inserida.
3. **Edição do `src/lib/lockfile-sync.test.ts`**:
   - Adição do teste de versões exatas.
4. **Execução e Validação**:
   - `bun run test src/lib/lockfile-sync.test.ts`
   - `bun run typecheck`
   - `bun run lint`
   - `bun run test`
   - `compile_applet`
5. **Registro nos Documentos Vivos**:
   - Registro detalhado com saídas reais no `BACKLOGER.md` (TASK-112).
   - Atualização do `CERNE.md`.
