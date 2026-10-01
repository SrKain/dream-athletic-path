# Planejamento & Check: Ajustes na Página Pública Individual da Atleta (TASK-040 Review)

- **Data/Hora:** 2026-08-24 15:35
- **Autor/Executor:** Antigravity AI
- **Solicitante:** Kauan / Equipe Go Team Go
- **Status:** `[VERIFICADO E EM CONFORMIDADE]`

---

## 1. Objetivo do Check

Realizar a auditoria técnica e validação completa dos 6 itens solicitados para a **página pública individual da atleta** e painel administrativo, assegurando conformidade estrita com as diretrizes do `AGENTS.md`, `UI&UX.md`, `CERNE.md` e `BACKLOGER.md`.

---

## 2. Auditoria dos Critérios de Aceite

| Item                      | Critério de Aceite                                                                                                                          |      Status      | Detalhes da Implementação                                                                                                                                             |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------ | :--------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Hero**               | Subtítulo do Hero removido ("Performance · Personality · Potential").                                                                       | ✅ **CONCLUÍDO** | Em `src/routes/athlete.$slug.tsx`, o container do Hero exibe apenas o nome, foto 4:5, badges, métricas fluídas e CTAs, sem o subtítulo.                               |
| **2. Labels**             | "Class:" -> "HIGH SCHOOL GRAD.:"; "GPA" -> "Current GPA".                                                                                   | ✅ **CONCLUÍDO** | Linhas de métricas essenciais e Academic Grid atualizados com os labels exatos em maiúsculas/título.                                                                  |
| **3. Formatação GPA**     | GPA sempre exibido com pelo menos 1 casa decimal (ex: `4.0`, `3.0`, `2.0`).                                                                 | ✅ **CONCLUÍDO** | Função `formatGpa` em `src/lib/units.ts` com formatação `minimumFractionDigits: 1`, com 100% de testes unitários aprovados em `src/lib/units.test.ts`.                |
| **4. Botão "Watch Film"** | Botão funcional abrindo link do YouTube; suporte a múltiplos vídeos configuráveis no admin.                                                 | ✅ **CONCLUÍDO** | Botões mapeados dinamicamente em `filmVideos` com links diretos `youtubeWatchUrl`, rótulos customizáveis e cadastro ilimitado no admin (`athlete_videos`).            |
| **5. Reels**              | Seção "Highlight Reels" removida da página individual da atleta.                                                                            | ✅ **CONCLUÍDO** | `ReelsRow` e navegação rápida "Highlights" removidos da página da atleta. Escopo futuro de feed vertical registrado em `BACKLOGER.md` (TASK-041).                     |
| **6. Fact Sheet**         | "High School Class" -> "High School Graduation"; "Seasons Eligibility Left" removido; novos campos "Athlete Status" e "College Start Date". | ✅ **CONCLUÍDO** | Migration `0014_athlete_status_college_start.sql` aplicada; campos editáveis no admin (`admin/athletes/$id.tsx`) e renderizados no Fact Sheet de `athlete.$slug.tsx`. |

---

## 3. Melhoria de Refinamento (Sem Breaking Changes)

- Atualizar o select de **Athlete Status** no Admin e tipos para garantir cobertura explícita de todas as 7 opções (`High School`, `Freshman`, `Sophomore`, `Junior`, `Senior`, `Graduate`, `Transfer`, `Graduate Transfer`).
- Adicionar lista de sugestões (`datalist` ou options padrão) no campo **College Start Date** para facilitar o preenchimento de termos (`Fall 2024`, `Spring 2025`, `Fall 2025`, `Spring 2026`, etc.).

---

## 4. Próximos Passos

Apresentar o relatório de checagem ao usuário.
