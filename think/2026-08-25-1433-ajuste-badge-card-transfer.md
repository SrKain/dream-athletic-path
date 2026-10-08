# Planejamento — Ajuste da Badge do Card de Atleta no Catálogo Público (TRANSFER)

**Data/Hora:** 2026-08-25 14:33  
**Solicitante:** Kauan  
**Executor:** Antigravity AI  
**Status:** `[CONCLUÍDO]`  

---

## 1. Contexto e Motivação

O usuário solicitou o ajuste do texto da badge exibida no canto superior dos cards de atletas no catálogo público (`src/routes/index.tsx`), substituindo a palavra **"FRESHMAN"** por **"TRANSFER"**.

A lógica de exibição da badge no card foi introduzida na TASK-046 para sinalizar os atletas cujo status universitário/acadêmico difere do status padrão ("Junior"). Com este ajuste, a badge refletirá explicitamente a nomenclatura esportiva norte-americana **"TRANSFER"**.

---

## 2. Escopo das Modificações

### A. `src/routes/index.tsx`
- No componente `AthleteCardItem`:
  - Renomear a variável lógica de verificação de `showFreshmanBadge` para `showTransferBadge`.
  - Atualizar o texto renderizado dentro da tag `<span>` da badge de `"FRESHMAN"` para `"TRANSFER"`.
  - Manter a estilização premium com borda e fundo esmeralda translúcido (`border-emerald-500/35 bg-emerald-950/90 text-emerald-300 uppercase shadow-xs backdrop-blur-xs font-bold tracking-wider text-[10px]`).

---

## 3. Arquivos Impactados

1. `src/routes/index.tsx` — Atualização da variável e do texto da badge no `AthleteCardItem`.
2. `BACKLOGER.md` — Registro da TASK-047 com status e histórico.
3. `CERNE.md` — Atualização da documentação viva dos componentes e rotas.

---

## 4. Verificação de Qualidade e Conformidade

- [ ] Executar `npx prettier --write` nos arquivos modificados.
- [ ] Executar `lint_applet` para assegurar conformidade sem erros de ESLint.
- [ ] Executar suíte de testes Vitest (`npm run test`).
- [ ] Executar `compile_applet` para certificar build de produção impecável.
