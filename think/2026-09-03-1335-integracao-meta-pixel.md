# Planejamento: Integração do Meta Pixel (Facebook Pixel) no Portfólio (TASK-061)

- **Data/Hora:** 2026-09-03 13:35
- **Autor/Executor:** Antigravity AI
- **Solicitante:** Kauan / Equipe Go Team Go
- **Status:** `[CONCLUÍDO]`

---

## 1. Contexto e Objetivo

O solicitante requisitou a injeção do Meta Pixel (Facebook Pixel) oficial com Pixel ID `1115203944400884` em todas as páginas do portfólio para rastreamento de acessos e campanhas de tráfego pago.

Requisitos específicos estipulados:
1. **Verificação de duplicidade:** Não duplicar o script caso já exista no projeto.
2. **Framework moderno:** Integrar no arquivo de layout/template raiz de forma compatível com a arquitetura TanStack Start / Vite / SSR / SPA.
3. **Roteamento client-side:** Garantir que o evento `"PageView"` dispare a cada mudança de rota client-side, e não somente no carregamento inicial.
4. **Preservação de layout:** Não alterar nenhum outro comportamento, estilo ou conteúdo do site.
5. **Transparência:** Informar com precisão os arquivos alterados ao término.

Código fornecido:

```html
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1115203944400884');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1115203944400884&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->
```

---

## 2. Diagnóstico Prévio

1. **Busca por Duplicidades:** Realizada busca global recursiva (`grep -rn`) no repositório por `1115203944400884`, `fbq` e `fbevents`. Resultado: **0 ocorrências encontradas**, confirmando ausência prévia da tag.
2. **Ponto de Injeção Centralizado:** A aplicação utiliza TanStack Start sobre TanStack Router. O layout e casca HTML raiz estão centralizados em `src/routes/__root.tsx` (`RootShell` e `RootComponent`), local onde já residem as tags do Google Analytics 4 (GA4) e Microsoft Clarity.

---

## 3. Escopo e Arquivos Afetados

| Arquivo | Ação | Responsabilidade |
| :--- | :---: | :--- |
| `src/routes/__root.tsx` | **Modificação** | 1. Inserir o script oficial do Meta Pixel e fallback `<noscript>` dentro da tag `<head>` no `RootShell`.<br>2. Adicionar o componente auxiliar `MetaPixelTracker` com `useRouterState` e `useRef` para disparar `fbq('track', 'PageView')` em cada transição client-side de rota, prevenindo duplicidade no carregamento inicial. |
| `CERNE.md` | **Documentação** | Documentar a integração do Meta Pixel na documentação viva do sistema na seção de telemetria/analytics. |
| `BACKLOGER.md` | **Governança** | Registrar a solicitação como `TASK-061` e marcar como `[CONCLUÍDO]`. |

---

## 4. Detalhes de Implementação Técnica

### Injeção no `<head>` de `RootShell` (`src/routes/__root.tsx`)
```tsx
{/* Meta Pixel Code */}
<script
  id="meta-pixel"
  dangerouslySetInnerHTML={{
    __html: `
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '1115203944400884');
      fbq('track', 'PageView');
    `,
  }}
/>
<noscript>
  <img
    height="1"
    width="1"
    style={{ display: "none" }}
    src="https://www.facebook.com/tr?id=1115203944400884&ev=PageView&noscript=1"
    alt=""
  />
</noscript>
```

### Rastreamento Contínuo em Rotas Client-Side (SPA)
```tsx
function MetaPixelTracker() {
  const href = useRouterState({ select: (s) => s.location.href });
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (typeof window !== "undefined" && typeof (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq === "function") {
      (window as unknown as { fbq: (...args: unknown[]) => void }).fbq("track", "PageView");
    }
  }, [href]);

  return null;
}
```
O componente `<MetaPixelTracker />` é incluído dentro de `RootComponent` (envolto por `<AppProviders>`).

---

## 5. Impactos e Riscos

- **Impacto no Desempenho:** Inexistente/Mínimo. O snippet do Meta Pixel injeta a biblioteca `fbevents.js` de forma assíncrona (`t.async = !0`), sem bloquear renderização nem hydration.
- **Risco de Duplicidade:** Evitado com `useRef(true)` no primeiro mount, garantindo que o primeiro PageView é despachado pelo script raiz e apenas as trocas subsequentes de rota disparam novos eventos.
- **Riscos de Layout ou Quebra:** Zero. Nenhuma alteração visual ou funcional nas rotas ou dados.

---

## 6. Estratégia de Validação

1. Verificação estática de tipos e linting com ESLint (`lint_applet`).
2. Compilação completa de produção com Vite e TanStack Start (`compile_applet`).
3. Execução dos testes automatizados unitários via Vitest.
