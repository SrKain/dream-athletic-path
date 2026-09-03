# Planejamento: Correção de Ordem de @import no styles.css para LightningCSS

- **Data/Hora:** 2026-08-25 17:05
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Antigravity AI
- **Status:** `[CONCLUÍDO]`

---

## 1. Contexto e Diagnóstico

O LightningCSS reportou o erro de compilação:
`"[lightningcss] @import rules must precede all rules aside from @charset and @layer statements" em /app/applet/src/styles.css`

Isso ocorre porque no arquivo `src/styles.css`:

- A diretiva `@source "../src";` estava posicionada na linha 2, antes do `@import url(...)` do Google Fonts na linha 5.
- Conforme a especificação CSS e os requisitos do parser LightningCSS, todas as regras `@import` devem obrigatoriamente preceder qualquer outra regra ou diretiva (incluindo `@source`).

---

## 2. Plano de Correção

1. **Reordenar o topo de `src/styles.css`**:
   Mover todos os `@import` para o início absoluto do arquivo:
   ```css
   @import url("https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700;800&family=Oswald:wght@500;600;700&family=Quicksand:wght@500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap");
   @import "tailwindcss" source(none);
   @import "tw-animate-css";
   @source "../src";
   ```
2. **Validação**:
   - Executar `compile_applet` para validar o build com o LightningCSS.
   - Executar `lint_applet` e `npm test`.
   - Atualizar a documentação viva em `CERNE.md` e `BACKLOGER.md`.
