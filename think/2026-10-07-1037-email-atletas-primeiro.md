# Planejamento — Redesenho dos E-mails do Mailer (Leitura em 5 Segundos: Atletas Primeiro, Texto por Último)

- **Data/Hora:** 2026-10-07 10:37 (Horário Local)
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Engineer)
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** [AGUARDANDO APROVAÇÃO HUMANA EXPLÍCITA]

---

## 1. Contexto e Diagnóstico do Problema

### Contexto Atual
A plataforma Go Team Go (Sport Scout Hub) envia e-mails de recrutamento para treinadores (coaches) universitários internacionais nos formatos:
1. **Single Athlete**: Apresentação direcionada de um prospect específico.
2. **Multi Athlete**: Vitrine com lista curada de prospects da agência.
3. **Catalog / Portfolio**: Apresentação institucional de todo o banco de atletas sem privilegiar indivíduos.

### Problema Identificado
Atualmente, a estrutura dos e-mails segue um padrão editorial longo:
- O coach abre a mensagem e é recebido por um Hero com imagem pesada, título grande e uma introdução de 2 colunas detalhando 4 benefícios institucionais.
- A lista de atletas só aparece após rolagem considerável ("below the fold").
- Em uma rotina corrida de recrutamento universitário nos EUA, coaches gastam menos de 5 segundos avaliando um e-mail de scouting. Se as métricas essenciais (Posição, Altura, Graduação/Class, GPA e Vídeo) não estiverem imediatamente visíveis, a taxa de resposta e engajamento despenca.

### Objetivo
Reestruturar a hierarquia de todos os e-mails para um padrão de **leitura instantânea em 5 segundos**:
1. Logo da agência no topo (sem hero obstrutivo).
2. Saudação direta de 1 linha.
3. **Ficha escaneável das atletas logo no topo**, com specs em destaque, badge TRANSFER semântica e 4 botões de ação tátil rápida (mínimo 44px): `WATCH FILM`, `I'M INTERESTED` (mailto pré-preenchido), `FULL PROFILE` e `NOT A FIT`.
4. CTA de solicitação de mais atletas.
5. Bloco institucional compacto (Hero + Intro) movido para o **final do e-mail**, servindo apenas como assinatura de credibilidade e contexto de apoio.

---

## 2. Decisões Arquiteturais e Propostas

### 2.1. Layout Multi-Atleta: 1 Atleta por Linha (Largura Total) vs. 2 Colunas
- **Proposta Escolhida:** **1 atleta por linha em largura total** (`width: 100%`, máx 680px).
- **Justificativa Técnica e UX:**
  1. Cada ficha de atleta possui agora 4 botões de ação (`WATCH FILM`, `I'M INTERESTED`, `FULL PROFILE`, `NOT A FIT`), com exigência de área de toque mínima de 44px de altura para conformidade com mobile e acessibilidade. Em 2 colunas (aproximadamente 290px por coluna no desktop), os 4 botões ficariam espremidos, gerando quebras feias de texto ou botões microscópicos propensos a toques acidentais.
  2. A linha de specs (**POSIÇÃO · ALTURA · CLASS OF · GPA · PAÍS**) requer respiro horizontal para leitura rápida e escaneabilidade em 5 segundos.
  3. No desktop, a ficha em largura total adota uma disposição elegante: foto/avatar à esquerda (100–120px) e specs + botões alinhados à direita. No mobile, a tabela se empilha naturalmente sem deformação.

### 2.2. Destino da Imagem de Fundo do Hero Antigo
- **Proposta:** **Remoção da imagem de fundo pesada no topo**. No bloco institucional ao final do e-mail, adotaremos um card elegante com fundo neutro claro (`#f8faf9`), borda sutil esmeralda (`#e2e8f0` / `#059669`), tipografia refinada e os benefícios resumidos em 1 linha com divisores (`•` bullet points), garantindo:
  1. Carregamento ultrarrápido do e-mail no Gmail/Outlook.
  2. Zero distração antes do conteúdo das atletas.
  3. Redução significativa do peso do HTML (< 60KB).

### 2.3. Especificação do Botão "I'M INTERESTED" (Botão Recrutar)
- **Ação:** Link `mailto:` direcionado para `EMAIL_SIGNATURE.email` (ou e-mail oficial da agência).
- **Subject:** `[Interested] {Nome} ({Posição}, Class of {ano})`
- **Body:** `Hi Go Team Go Team,\n\nI am interested in {Nome} ({Posição}, Class of {ano}). Please send more information, academic transcripts, and full match film.\n\nBest regards,\nCoach {CoachName}`

### 2.4. Especificação do Botão "NOT A FIT" (Discreto)
- **Ação:** Link HTTP para `${APP_URL}/feedback?coach=${coachEmail}&athleteId=${athlete.id}&sentiment=not_fit&token=${feedbackToken}`
- **Estilo:** Visual secundário/neutro discreto (texto com sublinhado ou botão ghost em tom cinza suave `#64748b`), evitando poluição visual mas garantindo captura de desinteresse por prospect individual.

---

## 3. Escopo e Estrutura dos Arquivos Afetados

### 3.1. Módulos de E-mail (`src/lib/email/`)
- `src/lib/email/email-brand.ts` (ou tokens em `templates.ts` / helpers): Definição de cores, tipografia e tokens compatíveis com clientes de e-mail (Gmail, Outlook VML, Apple Mail, Webmail).
- `src/lib/email/templates.ts` & `src/lib/email/recruit-email.ts` (ou renderizadores especializados):
  - `renderAthleteCard(athlete, options)`: Renderizador de ficha individual em tabela HTML 680px com foto, specs destacadas, badge TRANSFER, destaque opcional e os 4 botões de ação rápida.
  - `renderSingleAthleteRecruitEmail(params)`: Template do modo Single (Header -> Saudação -> Ficha da Atleta -> CTA Request More -> Bloco Institucional Compacto -> Assinatura / Rodapé).
  - `renderMultiAthleteRecruitEmail(params)`: Template do modo Multi (Header -> Saudação -> Lista vertical de Fichas -> CTA Request More -> Bloco Institucional Compacto -> Assinatura / Rodapé).
  - `renderCatalogRecruitEmail(params)`: Template do modo Catalog (Header -> Saudação -> Botões de Ação Rápida no Topo -> Bloco Institucional Compacto -> Assinatura / Rodapé).
  - `generateRecruitEmailPlainText(...)` e `generateMultiAthletePlainText(...)`: Versões em texto puro refletindo a nova ordem prioritária com specs e links no início.

### 3.2. Interface Administrativa (`src/routes/_authenticated/admin/` & Modais)
- `src/components/send-recruit-email-dialog.tsx` (ou tela do Mailer):
  - Defaults de textos atualizados para formato curto (1 frase para saudação/greeting e hook).
  - Introduction remapeada para alimentar o bloco institucional do rodapé.
  - Preview interativo em tempo real sincronizado com o novo layout HTML.

### 3.3. Scripts e Ferramentas de Visualização (`scripts/`)
- `scripts/preview-emails.ts`: Script para geração local dos artefatos de visualização HTML em `docs/email-previews/`:
  - `single-athlete.html`
  - `multi-athlete-1.html`
  - `multi-athlete-4.html`
  - `multi-athlete-8.html`
  - `catalog.html`

### 3.4. Testes Automatizados (`src/lib/email/*.test.ts`)
- `src/lib/email/recruit-email-multi.test.ts` (e testes complementares):
  - Verificação da nova ordem estrutural dos blocos no HTML (atletas antes de qualquer texto institucional).
  - Validação da linha de specs formatada (**Posição · Altura imperial/cm · Class of · GPA · País/bandeira**).
  - Validação da badge TRANSFER (apenas para Freshman/Sophomore/Junior/Senior).
  - Validação dos parâmetros `mailto:` de `I'M INTERESTED`.
  - Validação do link `NOT A FIT` com `athleteId` específico de cada atleta.
  - Testes de tolerância a campos nulos/vazios e escape HTML seguro (`escapeHtml`).
  - Verificação de peso do HTML gerado (< 100KB).

---

## 4. Banco de Dados e Migrations

- **Auditoria de Banco:** Não é necessária nenhuma nova migração de banco de dados (`db/migrations/`).
- Todas as tabelas existentes (`athletes`, `athlete_profiles`, `agencies`, `agency_visual_settings`, `email_log`) já possuem os dados necessários para suprir todos os campos solicitados.

---

## 5. Plano Detalhado de Implementação (Passo a Passo)

1. **Passo 1 — Módulo de Renderização de E-mail:**
   - Construir/atualizar a anatomia de `renderAthleteCard` em tabela HTML estrita compatível com Outlook (VML) e mobile.
   - Montar a linha de specs: `Outside Hitter · 6'1" (185 cm) · Class of 2027 · GPA 3.8 · 🇧🇷 Brazil`.
   - Implementar os 4 botões horizontais com área de toque mínima de 44px.
2. **Passo 2 — Templates dos Modos Single, Multi e Catalog:**
   - Header minimalista com logo da agência.
   - Saudação direta de 1 frase.
   - Atletas em destaque imediato.
   - CTA "Request More Athletes".
   - Bloco institucional compacto no rodapé (Intro + benefícios em 1 linha).
   - Assinatura oficial, bottom bar e links de unsubscribe/compliance preservados.
3. **Passo 3 — Atualização de Assunto, Preheader e Plain Text:**
   - Geradores de Subject e Preheader com specs em primeiro plano.
   - `generateRecruitEmailPlainText` e `generateMultiAthletePlainText` atualizados.
4. **Passo 4 — Ajustes na UI Administrativa e Preview:**
   - Atualização de textos padrão dos inputs.
   - Sincronização do preview reativo em tempo real.
5. **Passo 5 — Testes Automatizados e Script de Preview:**
   - Atualização da suite de testes `recruit-email-multi.test.ts`.
   - Execução do script `scripts/preview-emails.ts` gerando os arquivos em `docs/email-previews/`.
6. **Passo 6 — Validação Completa:**
   - Executar `bun run validate` (lint, typecheck, tests, build) para garantir zero regressões.
7. **Passo 7 — Atualização de Governança:**
   - Atualizar `CERNE.md` e `BACKLOGER.md` (solicitante: Kauan).

---

## 6. Riscos, Mitigações e Critérios de Aceitação

| Risco | Impacto | Mitigação |
| :--- | :--- | :--- |
| Quebra de renderização no Outlook Windows | Alto | Uso estrito de tabelas HTML aninhadas, `table-layout: fixed`, `mso-table-lspace: 0pt` e botões estilizados em `<td>` com background color e padding interno. |
| Quebra de responsividade em telas 375px (iPhone SE) | Médio | Testar classes utilitárias de media queries `@media only screen and (max-width: 600px)` e empilhamento fluido de colunas. |
| E-mail cair na caixa de spam por excesso de links | Médio | Manter proporção balanceada de texto/links, HTML limpo, sem scripts, sem base64 e sem SVGs inline. |

### Critérios de Aceitação
- [ ] Atletas posicionadas imediatamente abaixo do cabeçalho de 1 linha.
- [ ] Specs completas (**Posição · Altura · Class · GPA · País**) visíveis em menos de 5 segundos.
- [ ] Botão `I'M INTERESTED` gera `mailto:` correto com assunto e corpo contextuais.
- [ ] Botão `NOT A FIT` contém o `athleteId` da atleta correspondente.
- [ ] Bloco institucional enxuto posicionado no final do e-mail.
- [ ] Modo Catalog atualizado com botões rápidos no topo.
- [ ] Previews HTML gerados em `docs/email-previews/`.
- [ ] Testes unitários passando e `bun run validate` 100% verde.

---

## 7. Status de Aprovação

- **Status:** [AGUARDANDO APROVAÇÃO HUMANA EXPLÍCITA]
- Nenhuma alteração no código foi realizada. Aguardando aprovação para iniciar a implementação completa.
