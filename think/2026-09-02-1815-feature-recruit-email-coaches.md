# Planejamento — Feature "Recruit Email" para Coaches

- **Data/Hora:** 2026-09-02 18:15 (Horário Local)
- **Autor/Executor:** Antigravity / Gemini Agent
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** [AGUARDANDO APROVAÇÃO HUMANA PRÉVIA]

---

## 1. Visão Geral e Objetivo da Feature

Permitir que a agência (**Go Team Go**), no painel administrativo:

1. **Gerencie uma base de Coaches Universitários** (CRUD manual individual e importação em massa via planilha CSV/XLSX com validação e deduplicação).
2. **Dispare campanhas de e-mail teaser em massa** a partir da página de um atleta específico para coaches selecionados da lista.
3. **Apresente um teaser minimalista de alto impacto visual** (estilo card esportivo premium, hero com foto, posição, 3 a 4 estatísticas-chave, hook line e botão único para o perfil público oficial), sem expor vídeos brutos ou fichas completas por e-mail, canalizando todo o tráfego de scouts para a plataforma web.
4. **Utilize a infraestrutura do Resend com envio em lote (Batch Send)**, persistindo o histórico detalhado de disparos em logs para auditoria e controle futuro.

---

## 2. Modelagem de Dados & Migrations

### 2.1. Arquivo de Migração: `db/migrations/0016_coaches_and_recruit_emails.sql`

```sql
-- Migration 0016 — Coaches & Recruit Email Teaser System

-- 1. Tabela de Coaches Universitários
CREATE TABLE IF NOT EXISTS public.coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  institution text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice case-insensitive para busca e prevenção de duplicidade por e-mail
CREATE UNIQUE INDEX IF NOT EXISTS coaches_email_lower_idx ON public.coaches (lower(trim(email)));
CREATE INDEX IF NOT EXISTS coaches_name_idx ON public.coaches (name);
CREATE INDEX IF NOT EXISTS coaches_institution_idx ON public.coaches (institution);

-- 2. Coluna opcional de hook line no perfil do atleta (caso queira personalizar por atleta)
ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS highlight_note text;

-- 3. Tabela de Logs de Disparo de E-mail de Recrutamento
CREATE TABLE IF NOT EXISTS public.recruit_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recruit_email_logs_athlete_id_idx ON public.recruit_email_logs (athlete_id);
CREATE INDEX IF NOT EXISTS recruit_email_logs_coach_id_idx ON public.recruit_email_logs (coach_id);
CREATE INDEX IF NOT EXISTS recruit_email_logs_sent_at_idx ON public.recruit_email_logs (sent_at DESC);

-- 4. Políticas de Segurança (Row Level Security - RLS)
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruit_email_logs ENABLE ROW LEVEL SECURITY;

-- Regra: Apenas agency_admin tem acesso total a coaches e logs
DROP POLICY IF EXISTS "Agency admin manage coaches" ON public.coaches;
CREATE POLICY "Agency admin manage coaches"
  ON public.coaches
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'agency_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'agency_admin'
    )
  );

DROP POLICY IF EXISTS "Agency admin manage recruit logs" ON public.recruit_email_logs;
CREATE POLICY "Agency admin manage recruit logs"
  ON public.recruit_email_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'agency_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'agency_admin'
    )
  );
```

### 2.2. Tipos em TypeScript (`src/types/db.ts`)

Adição dos tipos:

- `Coach`: `{ id: string; name: string; email: string; institution: string | null; created_at: string; }`
- `RecruitEmailLog`: `{ id: string; athlete_id: string; coach_id: string; subject: string; status: 'sent' | 'failed'; error_message: string | null; sent_at: string; }`
- Atualização em `AthleteProfile` para incluir `highlight_note?: string | null;`.

---

## 3. Gestão de Coaches no Admin (`/admin/coaches`)

### 3.1. Navegação

- Adição da seção no sidebar `src/components/app-shell.tsx` nos `adminLinks`:
  `{ to: "/admin/coaches", label: "Coaches", icon: GraduationCap }` (ou ícone representativo de esportes/universidade).

### 3.2. Tela `/admin/coaches` (`src/routes/_authenticated/admin/coaches.tsx`)

- **Cabeçalho com Métricas e Ações**:
  - Título editorial "Coaches Directory", contagem total de cadastrados.
  - Botão secundário "Import Spreadsheet" (abre modal de importação XLSX/CSV).
  - Botão primário "Add Coach" (abre modal de cadastro individual).
- **Barra de Filtro e Busca**:
  - Campo de busca instantânea filtrando por `name`, `email` ou `institution`.
- **Tabela de Coaches**:
  - Colunas: Nome do Coach, E-mail, Instituição/Universidade, Data de Cadastro, Ações (Editar, Excluir com confirmação).
  - Estado vazio com CTA convidativo caso não haja registros.

### 3.3. Modal de Cadastro / Edição Manual

- Campos:
  - Full Name (obrigatório, validação min 2 chars).
  - Email (obrigatório, validação regex RFC e normalização lowercase/trim).
  - Institution / University (opcional/recomendado).
- Tratamento de duplicidade de e-mail (alerta amigável se já existir).

### 3.4. Fluxo de Importação de Planilha (CSV ou XLSX)

- **Biblioteca**: Uso de `xlsx` (SheetJS) no frontend, permitindo ler com máxima compatibilidade arquivos `.xlsx`, `.xls` e `.csv` diretamente no navegador.
- **Detecção Inteligente de Colunas**:
  - Mapeamento flexível das colunas do arquivo (case-insensitive e variações):
    - Nome: `name`, `full_name`, `coach`, `coach name`, `nome`, `nome completo`.
    - E-mail: `email`, `e-mail`, `mail`, `coach email`, `contato`.
    - Instituição: `institution`, `university`, `college`, `school`, `instituição`, `universidade`, `faculdade`.
- **Pipeline de Validação & Higienização**:
  1. Leitura das linhas da planilha.
  2. Validação sintática do e-mail via regex e validação de nome presente.
  3. Verificação de duplicados dentro da própria planilha (mantém apenas a primeira ocorrência).
  4. Comparação em lote com os e-mails já existentes na tabela `coaches` do Supabase.
- **Relatório de Prévia & Resumo Antes da Gravação**:
  - Card resumo: **X Prontos para importar**, **Y Duplicados ignorados**, **Z Inválidos ignorados**.
  - Lista/tabela expansível detalhando os registros que serão inseridos e os erros encontrados.
  - Botão de confirmação: **"Import X Coaches"** (com loading state). Ao confirmar, insere em lotes (batch inserts de 100 em 100) no Supabase e exibe Sonner toast de sucesso.

---

## 4. Integração com Resend e Batch Send

### 4.1. Configuração e Variáveis de Ambiente

- `RESEND_API_KEY`: Verificada no backend via `process.env.RESEND_API_KEY`.
- `EMAIL_FROM`: `process.env.EMAIL_FROM ?? "Go Team Go <onboarding@resend.dev>"`.
  - **Nota sobre o Domínio do Remetente**: Se a agência tiver um domínio verificado no Resend (ex: `scout@goteamgoagency.com` ou `recruiting@goteamgoagency.com`), basta configurar na variável `EMAIL_FROM`. Enquanto não houver domínio próprio ativado, utilizará o remetente de teste padrão.
- Documentado no `.env.example`.

### 4.2. Template de E-mail: `recruit_teaser`

- Implementado em `src/lib/email/templates.ts` (ou renderizador dedicado `renderRecruitEmailHtml`).
- **Diretrizes Visuais (`UI&UX.md`)**:
  - Layout mobile-first, limpo e profissional, com paleta neutra premium (Dark Premium `#0b0b0c` ou Editorial Off-White com acentos em Verde Esmeralda `#059669`).
  - **Header**: Logo ou assinatura oficial "Go Team Go — College Scouting".
  - **Saudação**: "Dear Coach," (saudação institucional limpa para envio em lote).
  - **Hero do Atleta**:
    - Foto profissional de destaque (`athlete.photo_url` ou fallback de alta qualidade).
    - Nome completo em destaque tipográfico.
    - Posição esportiva em badge destacada (ex: `OUTSIDE HITTER`, `MIDDLE BLOCKER`).
  - **Stats Highlights (3 a 4 métricas limpas em grade 2x2 ou inline pills)**:
    - **Height**: ex: `6'1" (185 cm)`
    - **Nationality / Origin**: ex: `Brazil 🇧🇷`
    - **Graduation Year**: ex: `Class of 2026` (extraído de `athlete_profiles.high_school_graduation`)
    - **Status / Eligibility**: ex: `Freshman / 4 Years Eligibility` ou `GPA: 3.8`
    - _Regra Estrita_: **SEM links de vídeos no e-mail, SEM fichas densas**. Apenas o teaser instigante.
  - **Hook Line**:
    - Frase de impacto curta: do campo `athlete_profiles.highlight_note`, ou gerada elegantemente: _"High-performance international prospect seeking competitive NCAA / NAIA opportunities for the 2026/2027 season."_
  - **CTA Central Único**:
    - Botão com estilo _liquid-button_ esmeralda: **"View Full Profile & Match Videos"**
    - Link direto para a URL canônica: `https://portfolio.goteamgoagency.com/athlete/{slug}`
  - **Rodapé Oficial**:
    - Assinatura da agência Go Team Go, informações de contato institucional (`contact@goteamgoagency.com`), copyright e aviso de que a mensagem foi enviada pelo departamento de scouting internacional da agência.

### 4.3. Backend Server Function: `src/lib/email/recruit-email.server.ts` e `recruit-email.functions.ts`

- Utiliza `createServerFn({ method: "POST" })` com middleware `requireAgency` para segurança.
- **Processamento**:
  1. Carrega dados do atleta, esporte, posição e perfil.
  2. Carrega a lista de coaches selecionados pelos seus `coachIds`.
  3. Renderiza o e-mail (assunto e HTML).
  4. Agrupa os envios em lotes de até 100 e-mails (limite por chamada de `resend.batch.send`).
  5. Dispara via `resend.batch.send(...)`.
  6. Para cada coach, grava o registro correspondente em `recruit_email_logs` (`status = 'sent'` ou `'failed'`, com `error_message` se aplicável).
  7. Retorna para o cliente o resumo de envio: `{ success: true, totalSent: number, totalFailed: number }`.

---

## 5. UI no Admin: Modal de Disparo no Perfil do Atleta (`/admin/athletes/$id`)

### 5.1. Ponto de Entrada

- Na barra de ações superior do perfil do atleta em `src/routes/_authenticated/admin/athletes/$id.tsx`, ao lado dos botões existentes, adicionar o botão:
  - **"Send to Coaches"** com ícone `Mail` ou `Send`, estilo primário/destacado.

### 5.2. Modal Interativo "Send Recruit Teaser to Coaches"

O modal terá layout em duas colunas (ou abas fluidas em telas menores):

1. **Painel Esquerdo — Seleção de Destinatários**:
   - Barra de busca instantânea (filtra por nome de coach ou instituição).
   - Barra de controle de seleção:
     - Botão "Select All" / "Deselect All".
     - Badge com contagem: **"X of Y coaches selected"**.
   - Lista scrollável com checkboxes:
     - Cada item exibe: Nome do Coach, Instituição (em tag sutil), E-mail, e indicação discreta se já recebeu e-mail deste atleta anteriormente (consultando histórico recente de logs).
2. **Painel Direito — Pré-visualização Real (WYSIWYG)**:
   - Visualização do Assunto: `Subject: [Go Team Go Prospect] {Athlete Name} — {Position} ({Graduation Year})`.
   - Card com a prévia visual idêntica ao e-mail real que os coaches receberão (com a foto do atleta atual, altura formatada, nacionalidade, hook line e botão).
3. **Barra de Rodapé da Ação**:
   - Botão Cancelar.
   - Botão Primário: **"Send Email to X Coaches"**:
     - Desabilitado se nenhum coach for selecionado (`selectedCount === 0`) ou se o envio estiver em andamento.
     - Exibe spinner e status de progresso durante o envio.
   - Diálogo de confirmação rápida antes de disparar: _"Are you sure you want to send this recruit email to X coaches?"_
4. **Feedback Pós-Disparo**:
   - Toast informativo (Sonner): _"Recruit email successfully sent to X coaches!"_
   - Em caso de falha parcial ou total, notificação com contagem exata e detalhes do erro.

---

## 6. Checklist de Implementação & Protocolo de Governança

1. [ ] **Aprovação Prévia do Usuário Humano** deste documento `think/2026-09-02-1815-feature-recruit-email-coaches.md`.
2. [ ] Instalação da dependência `xlsx` para leitura de planilhas.
3. [ ] Criação do arquivo de migration `db/migrations/0016_coaches_and_recruit_emails.sql`.
4. [ ] Atualização dos tipos em `src/types/db.ts`.
5. [ ] Criação da rota `/admin/coaches` (`src/routes/_authenticated/admin/coaches.tsx`) com CRUD e importador com prévia.
6. [ ] Adição do link "Coaches" no sidebar em `src/components/app-shell.tsx`.
7. [ ] Implementação do template HTML do e-mail teaser em `src/lib/email/templates.ts` e helpers em `recruit-email.server.ts`.
8. [ ] Implementação da server function de disparo em lote `recruit-email.functions.ts`.
9. [ ] Criação do modal "Send to Coaches" no perfil do atleta em `src/routes/_authenticated/admin/athletes/$id.tsx`.
10. [ ] Validação com `npm run lint` e `npm run typecheck` / `compile_applet`.
11. [ ] Atualização viva da documentação em `CERNE.md`.
12. [ ] Atualização da tarefa `TASK-058` no `BACKLOGER.md` para status `[CONCLUÍDO]`.

---

## 7. Perguntas / Confirmações com o Usuário

1. **Domínio do Resend**: Há algum domínio próprio já verificado na sua conta do Resend para envio (ex: `scout@goteamgoagency.com`), ou mantemos o fallback padrão (`Go Team Go <onboarding@resend.dev>`) com leitura da env var `EMAIL_FROM`?
2. **Biblioteca de Planilhas**: Está aprovado utilizarmos a biblioteca `xlsx` para suportar tanto `.xlsx` quanto `.csv` nativamente no navegador com relatório prévio de importação?
3. **Aprovação Geral**: Podemos iniciar a execução do código conforme o plano acima?
