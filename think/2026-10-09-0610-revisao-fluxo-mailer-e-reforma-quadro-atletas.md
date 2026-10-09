# Planejamento — Revisão do Fluxo de Textos do Mailer e Reforma Estrutural do E-mail e Quadro das Atletas

- **Data/Hora:** 2026-10-09 06:20 (Horário Local)
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Engineer)
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** `[ANEXO RECEBIDO — AGUARDANDO APROVAÇÃO HUMANA EXPLÍCITA]`
- **Modalidade de Entrega:** Entrega Única e Consolidada (Zero Partial Delivery)
- **Migração de Banco de Dados:** NENHUMA (0 migrations)

---

## 1. Contexto e Diagnóstico Técnico dos Problemas

### 1.1. Por que os textos preenchidos no Mailer não aparecem corretamente no Preview nem no E-mail Final?

Realizamos uma auditoria linha a linha em `src/routes/_authenticated/admin/mailer.tsx`, `src/lib/email/recruit-email-template.ts`, `src/lib/email/recruit-email-catalog-template.ts`, `src/lib/email/recruit-email.ts` e `src/lib/email/recruit-email.server.ts`. Foram identificadas **4 causas raiz**:

1. **Descarte silencioso do campo `customHook` (Fechamento / Chamada):**
   - Na tela `/admin/mailer`, o estado `customHook` é enviado para `renderRecruitEmail`, `renderMultiAthleteRecruitEmail` e `sendMailerServerFn` (mapeado como `hookText` em `RecruitEmailRenderOptions`).
   - Entretanto, em `src/lib/email/recruit-email.ts` (`renderSingleAthleteRecruitEmail`, `renderMultiAthleteRecruitEmail`, `renderCatalogRecruitEmail`, `generateRecruitEmailPlainText` e `generateMultiAthletePlainText`), a propriedade `options.hookText` **não é lida nem renderizada em nenhum ponto do template**. Tudo o que o usuário digita nesse campo é ignorado tanto no preview quanto no e-mail enviado.
2. **Deslocamento indevido do Corpo do E-mail (`customIntroduction`):**
   - Na estrutura atual de `src/lib/email/recruit-email.ts`, o campo `customIntroduction` (`options.introductionText`) foi movido para o final do e-mail, escondido dentro de uma caixa secundária intitulada `"About Go Team Go Agency"`, abaixo dos cards das atletas.
   - Com isso, o e-mail ficou sem **Corpo do E-mail** entre a saudação e os quadros das atletas.
3. **Inconsistência nos campos do Modo Catálogo (`catalog`):**
   - Em `renderCatalogEmail` (`src/lib/email/recruit-email-catalog-template.ts`), `customHeadline` altera apenas o `subject` (que não aparece dentro do iframe de preview), enquanto o título visual dentro do HTML permanece hardcoded como `"Full International Prospect Database"`. Além disso, `customHook` não era repassado para `renderCatalogRecruitEmail`.
4. **Falta de interpolação de placeholders e quebras de linha nos textos customizados:**
   - Os placeholders sugeridos na própria interface (`{Name}`, `{N}`, `{ano}`) não eram interpolados quando o usuário preenchia uma saudação ou texto customizado (ex.: digitar `Hi Coach {Name},` exibia literalmente `{Name}` no HTML), e quebras de linha (`\n`) digitadas no textarea não eram convertidas para `<br />`.

---

## 2. Nova Estrutura Oficial do E-mail (Ordem Obrigatória)

Todos os e-mails gerados pelo Mailer (Preview WYSIWYG, HTML enviado via Resend e versão Plain Text) passarão a seguir rigorosamente a seguinte arquitetura vertical de 5 blocos:

```text
[Cabeçalho Institucional Go Team Go (Logo + Linha Dourada)]
       |
1. SAUDAÇÃO (Greeting — editável no Mailer, com suporte a {Name})
       |
2. CORPO DO E-MAIL (Body — editável no Mailer, posicionado ANTES dos quadros das atletas, com suporte a parágrafos)
       |
3. QUADRO OU QUADROS DAS ATLETAS (Athlete Card / Cards — reformado conforme imagem anexa)
       |
4. FECHAMENTO DO E-MAIL (Closing — editável no Mailer, posicionado LOGO APÓS os quadros das atletas)
       |
5. RODAPÉ EXISTENTE COM ASSINATURA DA FABIANA (renderSignature + Feedback + BottomBar + Unsubscribe)
```

### Mapeamento Claro dos Campos no Criador de E-mails (`/admin/mailer`)

Na aba **Create Send** em `src/routes/_authenticated/admin/mailer.tsx`, os 3 campos de texto do criador serão padronizados, rotulados com clareza na ordem exata do e-mail e conectados em tempo real ao preview e ao disparo:

1. **Saudação (`customGreeting`)**:
   - Posição: Topo do e-mail (Bloco 1).
   - Suporte automático ao placeholder `{Name}` (no preview substitui por `Smith`; no envio real substitui pelo sobrenome/nome de cada coach destinatário, com fallback limpo para `Hi Coach,` caso o nome não exista).
2. **Corpo do E-mail (`customIntroduction`)**:
   - Posição: Logo abaixo da Saudação e **antes** do(s) quadro(s) da(s) atleta(s) (Bloco 2).
   - Textarea com suporte a múltiplos parágrafos (`\n` convertido para `<br />` após sanitização `escapeHtml`).
3. **Fechamento do E-mail (`customHook`)**:
   - Posição: Logo **abaixo** do(s) quadro(s) da(s) atleta(s) e **antes** do rodapé com a assinatura da Fabiana (Bloco 4).
   - Textarea com suporte a quebras de linha e texto default em inglês caso não preenchido.

---

## 3. Reforma do Quadro das Atletas Conforme Imagem Anexa + 3 Botões 100% em Inglês

Analisamos detalhadamente o modelo enviado em anexo (`WhatsApp Image 2026-10-08 at 7.32.14 AM.jpeg` — exemplo *NICOLE DE OLIVEIRA DA SILVA*).

### 3.1. Estrutura e Informações do Quadro da Atleta (Fiel ao Anexo)

Cada quadro de atleta (`renderAthleteCard` em `src/lib/email/recruit-email.ts`) terá o layout de ficha vertical estruturada com fundo `#f3f6f1` (`EMAIL_COLORS.cardBg`), borda `1px solid #e3e9dc` (`EMAIL_COLORS.cardBorder`), cantos arredondados (`12px`) e a seguinte anatomia exata:

1. **Linha Superior (Cabeçalho do Quadro):**
   - **Esquerda:** Número sequencial em verde-escuro bold (`01`, `02`, `03`...) + badge opcional `TRANSFER` quando elegível (`Freshman`, `Sophomore`, `Junior`, `Senior`, `Transfer`).
   - **Direita:** Código ISO Alpha-3 do país em bold (`BRA`, `ARG`, `COL`, `USA`, etc.) + bandeira circular PNG (`18x18px`).
2. **Foto da Atleta + Faixa de Posição Acoplada:**
   - Foto da atleta com cantos superiores arredondados (`object-fit: cover`), clicável para o perfil público.
   - Faixa inferior verde-escura (`#084323` — `EMAIL_COLORS.darkGreenPrimary`) acoplada à base da foto com a **Posição em caixa alta bold branco** (ex.: `OUTSIDE HITTER`, `MIDDLE BLOCKER`, `SETTER`, `LIBERO`).
3. **Nome Completo da Atleta:**
   - Em **CAIXA ALTA**, extra-bold (`font-weight: 900`), cor verde-escura `#084323` (ex.: `NICOLE DE OLIVEIRA DA SILVA`).
4. **Lista de 4 Atributos com Ícones Oficiais (Exatamente como no Anexo):**
   - **Linha 1 (Altura):** Ícone de régua (`EMAIL_ASSETS.icons.height`) + Altura em pés/polegadas e centímetros (ex.: `5'8" (173 cm)`).
   - **Linha 2 (Início na Faculdade / Graduação):** Ícone de capelo (`EMAIL_ASSETS.icons.gradCap`) + Semestre/Ano de entrada (priorizando `college_start_date`, ex.: `Fall 2026`, com fallback para `high_school_graduation` / `Class of {graduation_year}`).
   - **Linha 3 (GPA):** Ícone de estatísticas (`EMAIL_ASSETS.icons.stats`) + GPA formatado (ex.: `GPA: 3.4`).
   - **Linha 4 (Curso de Interesse / Major):** Ícone acadêmico (`EMAIL_ASSETS.icons.academic`) + Curso de interesse da atleta vindo de `athlete_profiles.course_of_interest` (ex.: `Sports Medicine`, `Business Administration`, etc.; caso a atleta não tenha `course_of_interest` preenchido, faz fallback gracioso para `highlight_note` ou `Undecided / General Studies`).
   - *(Observação: para garantir que `college_start_date` e `course_of_interest` apareçam tanto no Preview quanto no disparo real, incluiremos esses dois campos nas queries de `athlete_profiles` em `src/routes/_authenticated/admin/mailer.tsx`, `src/lib/email/recruit-email.server.ts`, `src/components/send-recruit-email-dialog.tsx` e nas interfaces `EmailCardAthlete` / `RecruitEmailAthlete`).*

### 3.2. Os 3 Botões de Ação no Rodapé do Quadro da Atleta (100% em Inglês)

Na parte inferior de cada quadro de atleta, onde antes havia apenas 1 botão ou 4 botões misturados, teremos exatamente os **3 botões de ação 100% em inglês (US)** com excelente ergonomia mobile/desktop:

1. **`RECRUIT NOW`** *(Botão Primário de Destaque — Dourado `#f69e00` com texto Verde-Escuro `#084323` bold)*:
   - Link `mailto:fabiana@goteamgoagency.com` pré-preenchido em inglês com Subject (`[Interested] {Athlete Name} ({Position}, {Term/Year})`) e mensagem pronta para o coach recrutar a atleta imediatamente.
2. **`VIEW FULL PROFILE`** *(Botão Principal Institucional — Verde-Escuro `#084323` com texto Branco `#ffffff` bold e seta dourada `→`)*:
   - Link direto para o perfil público completo da atleta (`https://portfolio.goteamgoagency.com/athlete/{slug}`) com parâmetros UTM da campanha (`appendMailerUtmParams`).
3. **`NOT A FIT`** *(Botão Secundário Discreto — Borda sutil `#c5d4c0` / fundo claro com texto `#5e7165`)*:
   - Link direto para `${EMAIL_BASE_URL}/feedback?sentiment=not_fit&athleteId=${athlete.id}&coach=${coachEmail}&token=${feedbackToken}` para registrar que aquela atleta específica não se encaixa no perfil buscado pelo coach.

---

## 4. Escopo Completo de Arquivos que Serão Editados na Entrega Única

1. **`src/lib/email/email-layout.ts` & `src/lib/email/recruit-email-template.ts`**:
   - Adição dos campos `courseOfInterest?: string | null` e `collegeStartDate?: string | null` em `EmailCardAthlete` e `RecruitEmailData`, repassando-os em `mapEmailDataToAthlete`.
2. **`src/lib/email/recruit-email.ts`**:
   - Adição de `courseOfInterest`, `collegeStartDate` e `index` em `RecruitEmailAthlete`.
   - Reforma completa de `renderAthleteCard` seguindo fielmente o modelo da imagem anexa (topo `01` + `BRA` + bandeira circular, foto com barra verde `OUTSIDE HITTER`, nome em caixa alta bold, 4 linhas com ícones `Height`, `Fall 2026 / Class`, `GPA`, `Course of Interest / Sports Medicine` e os 3 botões em inglês: `RECRUIT NOW`, `VIEW FULL PROFILE`, `NOT A FIT`).
   - Reestruturação de `renderSingleAthleteRecruitEmail`, `renderMultiAthleteRecruitEmail` e `renderCatalogRecruitEmail` na ordem exata solicitada:
     `Header -> Saudação -> Corpo do E-mail -> Quadro(s) das Atletas -> Fechamento do E-mail -> Rodapé com Assinatura da Fabiana`.
   - Interpolação segura de placeholders (`{Name}`, `{University}`, `{N}`, `{ano}`) e conversão de quebras de linha (`\n` -> `<br />`) na Saudação, Corpo do E-mail e Fechamento.
   - Atualização de `generateRecruitEmailPlainText` e `generateMultiAthletePlainText` refletindo a mesma ordem e textos customizados.
3. **`src/lib/email/recruit-email-catalog-template.ts`**:
   - Repasse de `customGreeting`, `customIntroduction` (Corpo), `customHook` (Fechamento) e `customHeadline` para `renderCatalogRecruitEmail`.
4. **`src/routes/_authenticated/admin/mailer.tsx`**:
   - Inclusão de `course_of_interest` e `college_start_date` na consulta de `athlete_profiles` dentro de `loadInitialData()` e mapeamento em `buildPreviewAthleteData`.
   - Reorganização clara dos 3 campos de texto do criador na ordem exata do e-mail:
     1. **Greeting (Saudação — Topo)**
     2. **Email Body (Corpo do E-mail — Antes do quadro das atletas)**
     3. **Email Closing (Fechamento do E-mail — Após o quadro das atletas)**
   - Garantia de que qualquer alteração nesses campos atualiza instantaneamente o Preview (nos modos `single`, `multi` e `catalog`) e é enviada integralmente no payload de `sendMailerServerFn`.
5. **`src/lib/email/recruit-email.server.ts` & `src/components/send-recruit-email-dialog.tsx`**:
   - Inclusão de `course_of_interest` e `college_start_date` em `loadAthleteEmailData()` no servidor e no diálogo rápido de envio, garantindo paridade 100% entre Preview e E-mail real enviado via Resend.
6. **`src/lib/email/recruit-email-multi.test.ts` & `scripts/preview-emails.ts`**:
   - Atualização e ampliação dos testes automatizados validando a ordem dos 5 blocos (`Saudação -> Corpo -> Quadro das Atletas -> Fechamento -> Assinatura da Fabiana`), a renderização dos textos customizados, os novos campos do quadro (`collegeStartDate`, `courseOfInterest`) e os 3 botões 100% em inglês (`RECRUIT NOW`, `VIEW FULL PROFILE`, `NOT A FIT`).
   - Regeneração dos arquivos de preview em `docs/email-previews/`.
7. **Documentação Obrigatória (`CERNE.md` e `BACKLOGER.md`)**:
   - Registro da arquitetura atualizada em `CERNE.md` e conclusão da `TASK-090` em `BACKLOGER.md`.

---

## 5. Status da Aprovação Humana

- **Status:** `[ANEXO ANALISADO — AGUARDANDO APROVAÇÃO HUMANA EXPLÍCITA]`
- Nenhum arquivo de código foi modificado ainda. Confirme se aprova este plano atualizado com o modelo anexo para executarmos tudo em uma única entrega!
