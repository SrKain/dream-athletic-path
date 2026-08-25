# Planejamento: Adição da Assinatura no Rodapé do Site ("Powered by iasin.")

- **Data/Hora:** 2026-08-25 11:15
- **Autor/Executor:** Antigravity AI
- **Solicitante:** Kauan / Equipe Go Team Go
- **Status:** `[CONCLUÍDO]` — Implementado e verificado com sucesso após aprovação humana explícita

---

## 1. Contexto e Objetivo
O solicitante requisitou a adição da sua assinatura personalizada ao rodapé público do site:

```html
<a href="https://iasin.dev.br" target="_blank" rel="noreferrer" aria-label="Powered by Iasin" class="group mt-6 md:mt-0 md:self-end inline-flex items-center gap-2 text-[10px] md:text-xs opacity-70 hover:opacity-100 transition-opacity animate-in fade-in-0 slide-in-from-bottom-2 duration-700 ease-out motion-reduce:animate-none"><span class="uppercase tracking-[0.2em]">Powered by</span><span class="relative inline-block font-semibold normal-case tracking-[0.14em]"><span class="relative z-10">iasin.</span><span class="absolute left-0 right-0 -bottom-[2px] h-px bg-white/60 origin-left scale-x-0 transition-transform duration-500 ease-out group-hover:scale-x-100 motion-reduce:transition-none"></span></span></a>
```

---

## 2. Escopo e Arquivos a Serem Modificados

1. **`src/routes/index.tsx` (Página Inicial / Catálogo Público):**
   - Atualizar o bloco `<footer>` para incluir a assinatura estilizada junto aos direitos autorais ("© 2026 Go Team Go Agency. All rights reserved."), mantendo alinhamento harmonioso tanto em mobile quanto em desktop.

2. **`src/routes/athlete.$slug.tsx` (Página Pública do Atleta):**
   - Adicionar o bloco de `<footer>` institucional padronizado (com logo/nome da agência, direitos autorais e assinatura "Powered by iasin.") ao final da página do atleta, garantindo consistência visual em todas as telas públicas.

3. **`CERNE.md`:**
   - Registrar na documentação viva a padronização e inclusão do rodapé institucional com a assinatura do desenvolvedor.

4. **`BACKLOGER.md`:**
   - Atualizar o status da `TASK-045` para `[CONCLUÍDO]` após aprovação e execução.

---

## 3. Detalhamento da Implementação

### 3.1. Estrutura JSX no Rodapé (`src/routes/index.tsx` e `src/routes/athlete.$slug.tsx`)
```tsx
{/* Footer */}
<footer className="mt-16 border-t border-border/70 bg-background/60 py-10">
  <div className="container-edge flex flex-col md:flex-row items-center justify-between gap-6">
    <div className="flex items-center gap-3">
      {visual?.logo_url ? (
        <img src={visual.logo_url} alt="Go Team Go" className="h-7 w-auto object-contain" />
      ) : (
        <span className="font-display text-lg font-bold tracking-tight">Go Team Go</span>
      )}
      <span className="text-xs text-muted-foreground">
        · Connecting elite athletes with college programs across the USA.
      </span>
    </div>
    <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-muted-foreground">
      <span>© {new Date().getFullYear()} Go Team Go Agency. All rights reserved.</span>
      <a
        href="https://iasin.dev.br"
        target="_blank"
        rel="noreferrer"
        aria-label="Powered by Iasin"
        className="group mt-6 md:mt-0 md:self-end inline-flex items-center gap-2 text-[10px] md:text-xs opacity-70 hover:opacity-100 transition-opacity animate-in fade-in-0 slide-in-from-bottom-2 duration-700 ease-out motion-reduce:animate-none"
      >
        <span className="uppercase tracking-[0.2em]">Powered by</span>
        <span className="relative inline-block font-semibold normal-case tracking-[0.14em]">
          <span className="relative z-10">iasin.</span>
          <span className="absolute left-0 right-0 -bottom-[2px] h-px bg-white/60 origin-left scale-x-0 transition-transform duration-500 ease-out group-hover:scale-x-100 motion-reduce:transition-none"></span>
        </span>
      </a>
    </div>
  </div>
</footer>
```

---

## 4. Impactos e Riscos
- **Visual / UX:** Elemento sutil, elegante e moderno com efeito hover suave na linha inferior, respeitando `motion-reduce` e mobile-first.
- **Riscos:** Zero risco de quebra funcional.

---

## 5. Estratégia de Validação
1. Validação de lint via `lint_applet` (`npm run lint`).
2. Execução da suíte de testes automatizados com `vitest`.
3. Verificação de compilação de produção via `compile_applet` (`npm run build`).
