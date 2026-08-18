# Traduzir toda a aplicação para inglês (EUA)

Objetivo: o app passa a ser 100% em inglês americano — catálogo público, telas da agência, portal do atleta, e-mails e textos padrão do banco. O português deixa de existir na interface.

## O que muda

### 1. Interface pública (catálogo e perfil do atleta)

- Home/catálogo: hero, cabeçalho "Our Athletes", barra de busca, agrupamentos, selos ("Featured"), rodapé e CTA do WhatsApp.
- Perfil do atleta: hero ("Recruiting profile"), estatísticas (Height/Weight/Age/Position), Reels, About, Highlight video, Achievements, Gallery e CTA final ("Recruit athlete").
- Páginas de proposta pública e PDF.

### 2. Autenticação

- Login, esqueci a senha, redefinir senha, aceitar convite e cartão lateral de marca.

### 3. Área da agência (admin)

- Navegação, dashboard, atletas (abas Journey / Data / Profile & Media), pipeline, documentos, notificações, propostas, configurações e aba Visual — rótulos, placeholders, botões, mensagens de sucesso/erro e textos de ajuda.

### 4. Portal do atleta

- Timeline gamificada, mídia, documentos, notificações e pop-up de celebração de fase.

### 5. E-mails (Resend)

- Templates e assuntos reescritos em inglês, mantendo os placeholders existentes.

### 6. Conteúdo padrão do banco

- Nova migração que atualiza os textos-semente: etapas do pipeline e checklists, nomes de posições/esportes/países já existentes e mensagens padrão de celebração — copiando o valor em inglês para o campo PT quando aplicável, para que registros antigos não voltem a exibir português.

## Detalhes técnicos

- Remove o seletor PT/EN do header público e do perfil do atleta; `I18nProvider` passa a operar apenas com `en` (locale fixo, sem `localStorage`), e `messages.ts` mantém somente o dicionário inglês. A função `pick(pt, en)` passa a priorizar `en` com fallback para o valor cadastrado.
- `document.documentElement.lang` e o `<html lang>` em `__root.tsx` passam para `en`.
- Strings hardcoded em português nos componentes/rotas são substituídas diretamente (não serão movidas para o dicionário, para não inflar o refactor); apenas o que já usa `t()` continua no dicionário.
- Campos `*_pt` / `*_en` do banco permanecem no schema (evita migração destrutiva); a UI de admin passa a mostrar um único campo em inglês, gravando nos dois para compatibilidade.
- Nova migração `db/migrations/0010_english_defaults.sql` com os `UPDATE`s dos textos padrão. Precisa ser aplicada no seu Supabase.
- `messages.test.ts` e demais testes com asserts em português são ajustados; `bunx vitest run` e o build serão executados ao final.
- `CERNE.md` e `BACKLOGER.md` atualizados conforme as regras do projeto (documentação e registro permanecem em português, salvo pedido em contrário).

## Fora de escopo

- Tradução de conteúdo já cadastrado por você (bios, conquistas, títulos de vídeos) — esses textos continuam como estão no banco.
