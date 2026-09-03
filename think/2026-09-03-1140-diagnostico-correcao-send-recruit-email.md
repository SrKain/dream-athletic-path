# Diagnóstico Aprofundado e Plano de Solução: Correção da Página de Coaches e do Modal "Send to Coaches" (TASK-059)

**Data e Hora**: 2026-09-03 11:45  
**Solicitante**: Kauan (Usuário Humano)  
**Agente**: Antigravity AI  
**Status**: `[AGUARDANDO APROVAÇÃO HUMANA]`

---

## 1. Causa Raiz Descoberta (Idêntica em Ambas as Telas)

O usuário relatou:
1. *"não to conseguindo fazer nada ao selecionar o 'send to coaches' a tela abre sinalizando um erro"*
2. *"antes de seguir investigue também a página coaches que também está com o mesmo problema"*

### A Causa Exata
Ao inspecionar o código de `src/routes/_authenticated/admin/coaches.tsx` e `src/components/send-recruit-email-dialog.tsx`:

1. **Invocação Indevida de `buttonClass` como Função (`TypeError: buttonClass is not a function`)**:
   - No arquivo `src/components/admin-ui.tsx`, `buttonClass` e `secondaryButtonClass` são **constantes string** de estilização:
     ```ts
     export const buttonClass = "liquid-button inline-flex ...";
     export const secondaryButtonClass = "glass-panel inline-flex ...";
     ```
   - No entanto, em ambos os arquivos recém-criados, foram inseridas chamadas tratando a constante como função:
     - `className={buttonClass("secondary")}`
     - `className={buttonClass("primary")}`
   - **Efeito no Navegador**: No exato momento em que o usuário clica em *"Send to Coaches"* (abrindo o modal) ou acessa a rota `/admin/coaches` (abrindo a página), o motor JavaScript do React tenta executar a string como função e lança imediatamente:
     `Uncaught TypeError: buttonClass is not a function`
   - O React interrompe a renderização e o Error Boundary captura a exceção, exibindo a tela de erro para o usuário.

2. **Incompatibilidade de Props em `Panel` e `EmptyState` em `coaches.tsx`**:
   - `Panel` em `admin-ui.tsx` requer obrigatoriamente a prop `title: string` (`<Panel title="Coaches">...`). Em `coaches.tsx` estava sendo chamado como `<Panel>`.
   - `EmptyState` em `admin-ui.tsx` espera `children: ReactNode` (`<EmptyState>No coaches found.</EmptyState>`), mas estava recebendo `title` e `description`.

3. **Base de Coaches Inicialmente Vazia & Iframe Sandbox**:
   - A tabela `coaches` existe no banco Supabase e está pronta, porém contém 0 registros.
   - O modal de envio não explicava isso amigavelmente nem tinha botão de atalho para `/admin/coaches`.
   - O `iframe` de preview do e-mail com `sandbox="allow-same-origin"` causava restrições de segurança em navegadores quando aninhado dentro de outros iframes.

---

## 2. Escopo Completo da Correção

| Arquivo | Ação | Responsabilidade |
| :--- | :---: | :--- |
| `src/routes/_authenticated/admin/coaches.tsx` | **Correção** | 1. Substituir todas as invocações errôneas `buttonClass("primary")` e `buttonClass("secondary")` pelas classes corretas `buttonClass` e `secondaryButtonClass`.<br>2. Ajustar o componente `<Panel title="Coaches Directory">` com título obrigatório.<br>3. Corrigir o uso de `<EmptyState>No coaches found matching your search.</EmptyState>`.<br>4. Garantir total fluidez no cadastro manual, edição, exclusão e importador de planilhas. |
| `src/components/send-recruit-email-dialog.tsx` | **Correção** | 1. Substituir todas as invocações errôneas `buttonClass("primary")` e `buttonClass("secondary")` pelas classes corretas `buttonClass` e `secondaryButtonClass`.<br>2. Adicionar estado vazio inteligente quando não houver coaches, com botão CTA direto *"Manage & Import Coaches"* direcionando para `/admin/coaches`.<br>3. Blindar o preview do e-mail para renderização limpa e estável.<br>4. Exibir aviso de erro com botão de *"Retry"* caso a rede falhe. |
| `src/lib/email/recruit-email-template.ts` | **Reforço** | Blindagem contra valores nulos/indefinidos em todas as propriedades do atleta. |
| `BACKLOGER.md` | **Atualização** | Atualizar a TASK-059 contemplando o diagnóstico unificado de ambas as telas. |
| `CERNE.md` | **Documentação** | Registrar os ajustes de estabilidade e renderização após aplicação e validação. |

---

## 3. Plano de Validação e Testes
1. Validar que `/admin/coaches` carrega perfeitamente sem nenhum erro, exibe o estado vazio amigável quando não há dados, abre o modal de cadastro manual e abre o importador de planilhas.
2. Validar que no perfil do atleta (`/admin/athletes/$id`), ao clicar em *"Send to Coaches"*, o modal abre sem nenhum erro, exibe o preview do e-mail e as opções de envio/importação.
3. Executar o suite de testes automatizados (`npm run test`).
4. Executar o linter (`npm run lint`).
5. Validar o build de produção (`compile_applet`).

---

**Solicitação de Aprovação**: Solicito a aprovação prévia do usuário humano para aplicar a correção descrita acima nos dois arquivos e restabelecer o funcionamento completo.
