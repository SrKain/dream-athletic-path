# Plano de Solução: Ajuste de Espaçamento/Contraste em Highlights e Correção da Badge Transfer

**Data e Hora**: 2026-08-25 19:36  
**Solicitante**: Kauan  
**Agente**: Antigravity / Gemini Agent  
**Status**: `[AGUARDANDO APROVAÇÃO HUMANA]`

---

## 1. Contexto e Objetivos

Este plano atende a duas correções pontuais no catálogo público da Home (`/`):

### 1.1. Ajuste de Espaçamento e Contraste na Seção de Highlights (Sem mexer no Hero)
- **Restrição Estrita**: Não alterar gradiente, cor de fundo ou qualquer estilo do Hero (`#catalog-hero`). O Hero permanece 100% inalterado.
- **Diagnóstico**: O início da seção de Highlights (`#highlights-bar`) logo abaixo do Hero apresenta espaçamento superior insuficiente (`py-5 md:py-6`), deixando o título "Highlights · 8 Athletes" muito próximo da borda divisória superior, sem o respiro visual adequado.
- **Ação**:
  1. Aumentar o `padding-top` da seção (`pt-8 pb-6 md:pt-10 md:pb-8` ou `pt-10 pb-7 md:pt-12 md:pb-8`), mantendo coerência e harmonia com a cadência espacial das outras seções da Home.
  2. Ajustar o contraste tipográfico do cabeçalho ("Highlights · X Athletes") e dos rótulos de nome/posição das atletas contra o fundo da seção, assegurando conformidade estrita com WCAG AA (taxa de contraste ≥ 4.5:1 para texto normal), sem alterar a cor de fundo da seção.

### 1.2. Correção da Condicional da Badge "TRANSFER" no Card do Atleta (Home)
- **Diagnóstico**: Em `src/routes/index.tsx`, a condicional no componente `AthleteCardItem` estava verificando incorretamente `rawStatus.toLowerCase() !== "junior"`.
- **Regra de Negócio Exata**:
  - A badge "TRANSFER" deve ser exibida **apenas e exclusivamente** quando o `Athlete Status` for um destes 4 (quatro) valores:
    1. **Freshman**
    2. **Sophomore**
    3. **Junior**
    4. **Senior**
  - A badge **NÃO** deve ser exibida para **Graduate Transfer**, **High School**, **Graduate**, **Transfer**, ou valores nulos/vazios.
- **Ação**:
  1. Corrigir a lógica de exibição da badge em `AthleteCardItem` (`src/routes/index.tsx`) para usar um conjunto com as 4 opções exatas (`freshman`, `sophomore`, `junior`, `senior`), mantendo a comparação normalizada (case-insensitive).
  2. Manter o texto visual da badge como `"TRANSFER"`.
  3. Não alterar o perfil individual do atleta (`/athlete/$slug`), que já exibe o status real detalhado.

---

## 2. Arquivos Envolvidos

| Arquivo | Ação | Responsabilidade |
| :--- | :---: | :--- |
| `src/components/home-highlights-story-bar.tsx` | **Edição** | Ajuste do `padding-top` da seção de Highlights e refinamento de contraste dos textos e contadores sobre o fundo. |
| `src/routes/index.tsx` | **Edição** | Correção da condicional da badge "TRANSFER" no `AthleteCardItem` para os 4 status elegíveis: Freshman, Sophomore, Junior e Senior. |
| `think/2026-08-25-1936-ajuste-espacamento-highlights-e-badge-transfer.md` | **Criação** | Registro formal do plano de implementação para governança e aprovação. |
| `CERNE.md` | **Edição** | Atualização da documentação viva com as correções aplicadas. |
| `BACKLOGER.md` | **Edição** | Registro de conclusão da tarefa no diário de bordo. |

---

## 3. Detalhamento das Alterações

### 3.1. `src/components/home-highlights-story-bar.tsx`
- Alterar a classe do elemento `<section id="highlights-bar">`:
  - De: `className="border-b border-border/70 bg-surface/50 py-5 md:py-6"`
  - Para: `className="border-b border-border/70 bg-surface/50 pt-9 pb-6 md:pt-12 md:pb-8"`
- Refinar contraste do contador de atletas:
  - Contador: `text-xs font-bold text-foreground/80` (assegura legibilidade cristalina).
- Refinar rótulo dos nomes das atletas:
  - Nome: `text-xs font-bold text-foreground` com hover em `#f69e00`.
  - Posição: `text-[11px] font-semibold text-foreground/75`.

### 3.2. `src/routes/index.tsx`
- Atualizar a verificação da badge no `AthleteCardItem`:
```tsx
const TRANSFER_ELIGIBLE_STATUSES = new Set([
  "freshman",
  "sophomore",
  "junior",
  "senior",
]);

const rawStatus = getAthleteStatus(athlete);
const showTransferBadge = Boolean(
  rawStatus && TRANSFER_ELIGIBLE_STATUSES.has(rawStatus.trim().toLowerCase()),
);
```

---

## 4. Critérios de Aceite e Validação

1. ✅ **Espaçamento**: A seção de Highlights terá respiro superior equilibrado e espaçoso (`pt-9 md:pt-12`), sem sensação de elemento "colado" no Hero.
2. ✅ **Hero Intacto**: Nenhuma linha ou classe CSS do Hero (`#catalog-hero`) será modificada.
3. ✅ **Contraste WCAG AA**: Todos os textos da barra de Highlights terão contraste forte e legível contra o fundo.
4. ✅ **Badge TRANSFER Corrigida**:
   - Atletas com status "Freshman", "Sophomore", "Junior" e "Senior" recebem a badge "TRANSFER" no card.
   - Atletas com "Graduate Transfer", "High School", ou outros status NÃO recebem a badge.
5. ✅ **Validação Técnica**: `npm run lint` e `compile_applet` executados com 0 erros.
6. ✅ **Documentação**: `CERNE.md` e `BACKLOGER.md` atualizados.
