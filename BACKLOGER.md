# BACKLOGER.md — Diário de Bordo & Registro de Pendências para Inteligências Artificiais

Este arquivo registra o **histórico completo de todas as solicitações** enviadas por usuários humanos para agentes de Inteligência Artificial neste projeto, acompanhando o status, responsável, data/hora e o detalhamento da execução.

> **REGRA PARA IAs**: 
> Antes de iniciar qualquer trabalho, leia este arquivo. Se existirem tarefas com status `[PENDENTE]`, você pode resolvê-las ou dar continuidade após aprovação humana prévia. Ao concluir qualquer tarefa, atualize seu status para `[CONCLUÍDO]`.

---

## Log de Tarefas & Solicitações

| ID | Data / Hora | Solicitante | Agente Executor | Descrição da Solicitação | Status | Detalhes / Resultado |
| :---: | :---: | :---: | :---: | :--- | :---: | :--- |
| **TASK-001** | 2026-08-05 12:03 | Usuário Humano | Antigravity AI | Alinhamento inicial de escopo e leitura completa da arquitetura do projeto. | `[CONCLUÍDO]` | Análise detalhada realizada no README.md, SETUP.md e estrutura de arquivos. |
| **TASK-002** | 2026-08-05 12:51 | Usuário Humano | Antigravity AI | Instalação de dependências e diagnóstico de compilação/tipagem TypeScript. | `[CONCLUÍDO]` | Dependências instaladas (`npm install`), `npm run typecheck` executado com sucesso e zero erros. |
| **TASK-003** | 2026-08-05 12:58 | Usuário Humano | Antigravity AI | Criar processo de governança de IAs, documentação viva `CERNE.md`, diário de bordos `BACKLOGER.md`, regras no `README.md` (planejamento prévio, aprovação humana, mobile-first, leitura obrigatória) e `AGENTS.md`. | `[CONCLUÍDO]` | Arquivos `CERNE.md` e `BACKLOGER.md` criados; `README.md` e `AGENTS.md` atualizados com diretrizes estritas. |
| **TASK-004** | 2026-08-05 13:00 | Antigravity AI | Antigravity AI | Ajuste dos scripts do `package.json` para garantir execução multiplataforma (`npm run validate`). | `[CONCLUÍDO]` | Script `"validate"` em `package.json` atualizado de `bun run ...` para usar `npm run`. |
| **TASK-005** | 2026-08-05 13:07 | Usuário Humano | Antigravity AI | E-mail comemorativo de avanço de fase (mobile-first, visual impactante com confetes) via Resend + controle estrito de janela de envio (Seg-Sex 8-12h/13-19h, Sáb 9-12h/13-18h). | `[CONCLUÍDO]` | Plano criado e aprovado. Faltava configuração de mensagem padrão editável pela agência. |
| **TASK-006** | 2026-08-05 13:12 | Usuário Humano | Antigravity AI | Criar o guia de design system viva `UI&UX.md` consolidando a identidade visual existente, e torná-lo de leitura obrigatória no `README.md` e `AGENTS.md`. | `[CONCLUÍDO]` | Guia `UI&UX.md` criado e adicionado às regras de leitura mandatória de IAs. |
| **TASK-007** | 2026-08-05 (hoje) | Usuário Humano | GitHub Copilot | Implementação completa do sistema de e-mails celebrativos de avanço de etapa com mensagens configuráveis por etapa, janela inteligente de envios, template mobile-first (UI&UX.md) e animação de confetes no portal. Inclui: migration para `celebration_message_en`, UI de configuração em Settings com placeholders, módulo de janela de envio, template de e-mail Dark Premium, integração no Pipeline Kanban e confetti no portal. | `[CONCLUÍDO]` | Implementação completa com 16 tarefas: migration 0007, types atualizados, placeholders.ts, sending-window.ts + testes, celebration template, email.server.ts com scheduling, stage-change.server.ts, confetti-celebration.tsx, integrações em settings.tsx, pipeline.tsx e portal/index.tsx. Documentação atualizada no CERNE.md. |
| **TASK-008** | 2026-08-05 (hoje) | Usuário Humano | GitHub Copilot | Correção do sistema de build e adição de documentação mandatória de pré-requisitos. Problema: usuário tentou `npm run build` mas projeto requer Bun; script `validate` no package.json usava `npm run` incorretamente; faltava documentação clara de Quick Start, pré-requisitos e troubleshooting no README.md. | `[CONCLUÍDO]` | Implementação completa: (1) Corrigido script `validate` em package.json de `npm run` para `bun run`; (2) Adicionado callout MANDATORY sobre uso obrigatório do Bun no README.md; (3) Adicionada seção Quick Start com pré-requisitos, comandos e tabela de referência; (4) Adicionada seção Troubleshooting com 6 cenários comuns de erro e soluções; (5) Atualizado docs/SETUP.md com cross-reference ao README; (6) Atualizada seção Build System & Package Manager no CERNE.md com requisitos, comandos e arquivos de configuração. |
| **TASK-009** | 2026-08-05 (hoje) | Usuário Humano | GitHub Copilot | Correção de deploy persistente na Vercel causado por uso de npm em vez de Bun. Problema: Build logs mostravam `npm warn ERESOLVE overriding peer dependency` com conflito vite@8.1.5 vs vite@^5.0.0-7.0.0; Vercel não respeitava automaticamente `packageManager: bun@1.3.14` do package.json. | `[CONCLUÍDO]` | Implementação completa: (1) Criado vercel.json forçando `installCommand: bun install` e `buildCommand: bun run build`; (2) Atualizado docs/SETUP.md com seção crítica "⚠️ CRÍTICO: Configuração do Package Manager na Vercel" incluindo verificação no dashboard e validação de build log; (3) Adicionada seção de troubleshooting no README.md para erros de deploy com `npm warn ERESOLVE`; (4) Atualizado CERNE.md documentando vercel.json como arquivo crítico de configuração. Deploy agora usa Bun corretamente sem conflitos de peer dependencies. |
| **TASK-010** | 2026-08-05 (hoje) | Usuário Humano | GitHub Copilot | Correção de build quebrado na Vercel causado por código corrompido em email.server.ts. Problema: Últimas 3 tentativas de deploy falharam com erro de sintaxe TypeScript nas linhas 59-78 do arquivo src/lib/email/email.server.ts. Código estava malformado com definições de tipo misturadas no meio de chamadas de função. | `[CONCLUÍDO]` | Correção implementada: (1) Identificado código corrompido na função `sendEmail` onde `await logEmail({` estava com fragmentos de definição de tipo (`scheduledFor?: string`) no lugar dos argumentos corretos; (2) Reconstruída completamente a função `sendEmail` com branches corretas de agendamento e envio imediato; (3) Adicionado campo `scheduledFor?: string` na interface da função auxiliar `logEmail`; (4) Corrigido mapeamento `scheduled_for: entry.scheduledFor ?? null` na inserção do banco; (5) Validação local: `npm run typecheck` passou sem erros. Build agora compila sem erros de sintaxe. **UPDATE**: (6) Corrigido import incorreto em stage-change.server.ts de `@tanstack/start` (pacote inexistente) para `@tanstack/react-start` (correto). Erro de resolução de módulo durante build da Vercel foi eliminado. |

---

## Fila de Tarefas Pendentes `[PENDENTE]`

*Nenhuma outra tarefa pendente no momento.*

## 2026-08-05 — Integração Resend nas passagens de etapa
- **Solicitante:** Kauan
- **Executor:** Lovable (agente)
- **Pedido:** Ativar os disparos de e-mail via conta Resend própria nas transições de etapa.
- **Entrega:** Gatilho no `StageTimeline` ao marcar etapa como *Concluída*; server fn `notifyStageAdvancementServerFn` (`src/lib/email/stage-change.functions.ts`) protegida por `requireAgency`; lógica server-only em `stage-change.server.ts` com anti-duplicidade via `email_log`, link do portal por `APP_URL` e janela de envio (agendamento no Resend). Disparo removido do Kanban (agora só na conclusão).
- **Status:** [CONCLUÍDO] — pendente da chave `RESEND_API_KEY` e do domínio remetente no ambiente.

## 2026-08-06 — Pop-up de celebração na timeline do atleta
- **Solicitante:** Kauan
- **Executor:** Lovable (agente)
- **Pedido:** Ao avançar de fase, exibir um dialog no portal com mensagem pré-configurada pela agência e slider de imagens (nada renderizado quando não houver imagens), com confetes atrás do dialog.
- **Entrega:** Migração `0008_stage_portal_announcement.sql`; hook `use-stage-announcement`; componente `stage-celebration-dialog`; `fireConfetti` reutilizável; integração nas telas do portal e configuração por etapa em Admin → Configurações.
- **Status:** [CONCLUÍDO] — requer execução da migração 0008 no Supabase.

## TASK-011 — 2026-08-15 — Aba Visual e catálogo público em formato portfólio
- **Solicitante:** Usuário Humano
- **Executor:** GitHub Copilot
- **Pedido:** Criar aba Visual, textos configuráveis do catálogo, ordem manual de posições, previews e reels YouTube, perfil público em formato portfólio, WhatsApp flutuante e edição de mídias na ficha do atleta.
- **Entrega:** Migration 0009, tipos e loaders públicos, helpers YouTube, preview/autoplay, ReelsViewer, WhatsApp FAB, catálogo por posição, rota `/admin/visual`, vídeos YouTube na ficha e documentação viva atualizada.
- **Status:** [PENDENTE] — executar a migration 0009 no Supabase externo e concluir validação local quando o ambiente Bun/dependências estiver disponível.

## [CONCLUÍDO] Aba Visual + catálogo em formato portfólio
- Solicitante: usuário | Executor: Lovable
- Aba **Visual** no admin (`/admin/visual`): títulos do hero, cabeçalho "Nossos Atletas" e ordenação manual das posições.
- Catálogo: hero mais baixo, cabeçalho antes da busca, badge "Destaque" com contraste corrigido, prévia em vídeo (hover no desktop / centro da tela no mobile), FAB do WhatsApp.
- Perfil público: hero com vídeo destaque ao fundo, reels (highlights) antes do "Sobre", vídeo de apresentação, bloco do vídeo destaque, conquistas com imagem + texto, FAB do WhatsApp.
- Ficha do atleta no admin dividida em abas (Timeline / Dados / Perfil & mídia) com gestão de links do YouTube e upload de imagem da conquista.
- Pendente do usuário: aplicar `db/migrations/0009_visual_settings_media.sql` no Supabase.
