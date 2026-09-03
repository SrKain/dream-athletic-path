# Planejamento: Integração da Tag Microsoft Clarity

- **Data/Hora:** 2026-08-25 10:18
- **Autor/Executor:** Antigravity AI
- **Solicitante:** Kauan / Equipe Go Team Go
- **Status:** `[CONCLUÍDO]`

---

## 1. Contexto e Objetivo

O solicitante requisitou a integração do script de telemetria e mapas de calor **Microsoft Clarity** com Project ID `y7zkn8qxno`.

Código oficial fornecido:

```html
<script type="text/javascript">
  (function (c, l, a, r, i, t, y) {
    c[a] =
      c[a] ||
      function () {
        (c[a].q = c[a].q || []).push(arguments);
      };
    t = l.createElement(r);
    t.async = 1;
    t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0];
    y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", "y7zkn8qxno");
</script>
```

---

## 2. Escopo e Arquivos Afetados

- `src/routes/__root.tsx`:
  - Inserir a tag de script do Microsoft Clarity no elemento `<head>` de `RootShell`, permitindo o carregamento assíncrono seguro (`async: 1`) para rastreamento de mapas de calor, gravações de sessão e métricas de engajamento do usuário.
- `CERNE.md`:
  - Atualizar a documentação viva registrando a adição do Microsoft Clarity ao lado do Google Analytics 4.
- `BACKLOGER.md`:
  - Registrar a tarefa `TASK-044` e atualizar seu status para `[CONCLUÍDO]` após aprovação e implementação.

---

## 3. Detalhamento da Alteração em `src/routes/__root.tsx`

No `<head>` de `RootShell`:

```tsx
{
  /* Microsoft Clarity */
}
<script
  type="text/javascript"
  dangerouslySetInnerHTML={{
    __html: `
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "y7zkn8qxno");
    `,
  }}
/>;
```

---

## 4. Impactos e Riscos

- **Performance:** O script carrega de forma assíncrona (`async`), sem impacto negativo no Core Web Vitals (FCP, LCP).
- **Compatibilidade:** Funciona de forma integrada ao lado do Google Analytics 4 (GA4) e Vercel Analytics já existentes no projeto.
- **Riscos:** Nenhum risco estrutural de quebra ou regressão funcional.

---

## 5. Estratégia de Validação

- `npm run lint` (`lint_applet`).
- `npm run build` (`compile_applet`).
- Execução da suíte de testes automatizados com `vitest`.
- Verificação do HTML gerado com as tags de telemetria.
