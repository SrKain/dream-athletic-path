# Planejamento — Sincronização do bun.lock com Bun 1.3.14 e Validação Completa de Instalação/Build

- **Data/Hora:** 2026-10-16 15:00 (Horário Local)
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Architect)
- **Solicitante:** Kauan (Usuário Humano)
- **Repositório:** SrKain/dream-athletic-path (commit base 8e91de8)
- **Status:** `[APROVADO PELO USUÁRIO NO PROMPT]`
- **Package Manager Obrigatório:** Bun 1.3.14 (geração autêntica do lockfile e validação `--frozen-lockfile`)

---

## 1. Diagnóstico do Problema

### Causa Raiz Confirmada:
Na Vercel, o deploy falha durante a etapa de instalação de dependências:
```
error: lockfile had changes, but lockfile is frozen
```
Isso ocorre porque o comando de instalação configurado no `vercel.json` executa `bun install --frozen-lockfile` com **Bun 1.3.14**, mas no repositório remoto (commit `8e91de8`):
- O `package.json` declara:
  - `"@lovable.dev/vite-tanstack-config": "2.25.3"`
  - `"nitro": "3.0.260603-beta"`
- O `bun.lock` no repositório remoto continha entradas divergentes do commit anterior:
  - `"@lovable.dev/vite-tanstack-config": "2.13.1"`
  - `"nitro": "^3.0.260610-beta"`

Quando o Bun 1.3.14 é instruído a instalar com `--frozen-lockfile`, ele detecta que as versões declaradas no `package.json` não batem com o manifesto gravado no `bun.lock`, abortando imediatamente a build para evitar inconsistências não rastreadas.

---

## 2. Diretrizes e Governança Estrita

1. **Bun 1.3.14 Exclusivo**:
   - Verificar versão exata com `bun --version` (via Bun nativo ou `bunx bun@1.3.14`).
   - Não utilizar npm, yarn ou pnpm para alterar ou regenerar `bun.lock`.
   - Não editar hashes, entradas ou strings do `bun.lock` manualmente.

2. **Preservação de Versões do `package.json`**:
   - Manter as versões declaradas (`@lovable.dev/vite-tanstack-config@2.25.3`, `nitro@3.0.260603-beta`, TanStack Start 1.168.60 e Vite 7.3.6).
   - Gerar o `bun.lock` legítimo através da resolução oficial do Bun 1.3.14 em ambiente limpo.

3. **Preservação Integral das Correções do Mailer**:
   - Orquestração pelo navegador em micro-lotes de no máximo 2 e-mails.
   - Intervalo mínimo de 1s controlado pelo frontend.
   - Monitor de progresso com 7 métricas precisas e contagem regressiva reativa.
   - Proteção de concorrência entre abas (`BroadcastChannel` e lease no Supabase).
   - Textos exatos dos botões e assuntos dos coaches (`RECRUIT NOW` para Fabiana, `NOT A FIT` para Contact, `Reply-To: contact@goteamgoagency.com`).
   - Migration `0025_mailer_campaign_scoped_queue_and_metrics.sql` documentada como pré-requisito para o novo fluxo no Supabase.

4. **Ciclo de Validação em Diretório/Ambiente Limpo**:
   - `bun install --frozen-lockfile`
   - `bun run typecheck`
   - `bun run lint`
   - `bun run test`
   - `bun run build`

---

## 3. Plano de Ação

1. **Verificação de Ambiente**:
   - Confirmar execução de `bunx bun@1.3.14 --version` (resultado: `1.3.14`).
   - Executar `bun install` com Bun 1.3.14 para garantir sincronização estrita de `package.json` e `bun.lock`.

2. **Execução da Suíte de Validação**:
   - Validar `bun install --frozen-lockfile` (confirmar saída `(no changes)` e exit code 0).
   - Validar `bun run typecheck` (`tsc --noEmit`).
   - Validar `bun run lint` (`eslint .`).
   - Validar `bun run test` (`vitest run`).
   - Validar `bun run build` (`vite build`).

3. **Atualização Documental e Fechamento**:
   - Registrar a demanda no `BACKLOGER.md` (TASK-096).
   - Atualizar `CERNE.md` refletindo o status da governança do `bun.lock` e o alerta da migration `0025`.
   - Gerar relatório detalhado com os resultados reais dos comandos.
