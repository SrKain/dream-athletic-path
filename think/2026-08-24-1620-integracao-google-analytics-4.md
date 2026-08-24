# Planejamento: Integração da Tag Google Analytics 4 (GA4)

- **Data/Hora:** 2026-08-24 16:20
- **Autor/Executor:** Antigravity AI
- **Solicitante:** Kauan / Equipe Go Team Go
- **Status:** `[CONCLUÍDO]`

---

## 1. Contexto e Objetivo
O solicitante requisitou a adição da tag oficial do Google Analytics 4 (gtag.js) com Measurement ID `G-4D6DTG650F` para rastreamento de acessos, eventos e telemetria no website Go Team Go.

Tag solicitada:
```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-4D6DTG650F"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-4D6DTG650F');
</script>
```

---

## 2. Escopo e Arquivos Afetados
- `src/routes/__root.tsx`:
  - Inserir a tag de script do Google Analytics 4 (`https://www.googletagmanager.com/gtag/js?id=G-4D6DTG650F`) e o script de inicialização do `dataLayer` e `gtag('config', 'G-4D6DTG650F')` no `<head>` do `RootShell` (ou via propriedade `scripts` de `head` do `createRootRouteWithContext`), garantindo carregamento assíncrono e não-bloqueante tanto em SSR quanto em client hydration.
- `CERNE.md`:
  - Documentar a inclusão da tag GA4 na documentação viva.
- `BACKLOGER.md`:
  - Registrar a tarefa `TASK-043` como concluída após a aprovação e implementação.

---

## 3. Etapas de Implementação
1. **Atualização do `src/routes/__root.tsx`**:
   - Adicionar os elementos `<script>` no `<head>` dentro de `RootShell`:
     - `<script async src="https://www.googletagmanager.com/gtag/js?id=G-4D6DTG650F" />`
     - `<script dangerouslySetInnerHTML={{ __html: "window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-4D6DTG650F');" }} />`
2. **Execução de Verificações de Qualidade**:
   - `npm run lint` (`lint_applet`).
   - `npm run build` (`compile_applet`).
   - Execução dos testes automatizados com `vitest`.
3. **Atualização Documental de Governança**:
   - Atualizar `CERNE.md` e `BACKLOGER.md` (TASK-043).

---

## 4. Impactos, Riscos e Alternativas
- **Impacto**: A tag é executada de forma assíncrona (`async`) sem bloquear a renderização da página ou o tempo de carregamento perceptível (FCP/LCP).
- **Riscos**: Mínimos. Não altera a lógica de rotas, banco de dados ou layout visual existente.

---

## 5. Estratégia de Validação
- Validar via linting (`lint_applet`) e compilação do bundle (`compile_applet`).
- Executar a suíte de testes unitários para garantir zero regressões.
- Verificar a presença e formatação correta dos nós `<script>` no HTML renderizado.
