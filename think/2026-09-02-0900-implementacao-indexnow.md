# Planejamento — Implementação do Protocolo IndexNow (Bing / ChatGPT Indexing)

- **Data/Hora:** 2026-09-02T09:00:00-07:00
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Antigravity / Gemini Agent
- **Status do Plano:** [CONCLUÍDO] — Implementação finalizada, 80/80 testes vitest passando, submissão real de 11 URLs públicas aceita com status HTTP 202 pela API IndexNow.

---

## 1. Contexto & Objetivo

A **Go Team Go Agency** (`https://portfolio.goteamgoagency.com`) precisa notificar ativamente os motores de busca participantes do protocolo **IndexNow** (Bing, Yandex, Seznam, Naver e, por consequência, o índice consultado pelo ChatGPT durante navegação em tempo real) sempre que uma página pública (perfil de atleta ou página inicial) for criada, publicada ou atualizada.

Chave oficial IndexNow fornecida:
- **Chave:** `1675dcaaacd2469b9461671a29b307e0`
- **Arquivo de verificação:** `public/1675dcaaacd2469b9461671a29b307e0.txt`
- **Key Location:** `https://portfolio.goteamgoagency.com/1675dcaaacd2469b9461671a29b307e0.txt`
- **Host:** `portfolio.goteamgoagency.com`
- **Endpoint da API:** `https://api.indexnow.org/indexnow`

---

## 2. Escopo Mapeado & Arquitetura da Solução

### A. Arquivo de Verificação Estático
- **Arquivo:** `public/1675dcaaacd2469b9461671a29b307e0.txt`
- **Conteúdo:** Apenas o hash `1675dcaaacd2469b9461671a29b307e0` em texto plano, sem espaços ou quebras de linha adicionais.
- O Vite serve arquivos de `public/` diretamente na raiz, respondendo em `https://portfolio.goteamgoagency.com/1675dcaaacd2469b9461671a29b307e0.txt`.

### B. Módulo de Integração IndexNow (`src/lib/indexnow.ts`)
1. **Constantes:**
   - `INDEXNOW_KEY = "1675dcaaacd2469b9461671a29b307e0"`
   - `INDEXNOW_HOST = "portfolio.goteamgoagency.com"`
   - `INDEXNOW_KEY_LOCATION = "https://portfolio.goteamgoagency.com/1675dcaaacd2469b9461671a29b307e0.txt"`
   - `INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"`
2. **Payload IndexNow:**
   ```json
   {
     "host": "portfolio.goteamgoagency.com",
     "key": "1675dcaaacd2469b9461671a29b307e0",
     "keyLocation": "https://portfolio.goteamgoagency.com/1675dcaaacd2469b9461671a29b307e0.txt",
     "urlList": ["https://portfolio.goteamgoagency.com/..."]
   }
   ```
3. **Resolução de Ambiente (Navegador vs. Servidor / CLI):**
   - Como o endpoint do IndexNow não possui cabeçalhos CORS para requisições de preflight de navegadores, criaremos uma Server Function via TanStack Start (`submitToIndexNowServerFn`) para chamadas originadas do frontend administrativo, e uma função direta (`sendIndexNowRequest`) para execução no servidor e scripts CLI.
   - A função principal exportada `submitToIndexNow(urls: string[])` detectará o runtime:
     - No cliente (browser): despacha via `submitToIndexNowServerFn`.
     - No servidor / scripts CLI (Node/Bun): envia o POST HTTP diretamente.
   - Tratamento de erro 100% resiliente: bloco `try / catch` com logs de advertência (`console.warn`), sem jamais lançar exceções ou travar a experiência do usuário.

### C. Disparos nos Pontos de Mutação no Painel Admin (Fire-and-Forget)
1. **Criação e Edição de Atletas (`src/routes/_authenticated/admin/athletes/$id.tsx` e `index.tsx`):**
   - Ao salvar um atleta (`save()` em `$id.tsx`): caso `currentAthlete.is_public` seja verdadeiro, invocar de forma assíncrona (sem travar o toast de sucesso):
     ```ts
     void submitToIndexNow([`${CANONICAL_BASE_URL}/athlete/${nextSlug || currentAthlete.slug}`]);
     ```
   - No cadastro inicial de atleta caso já nasça público.
2. **Alterações Visuais da Home (`src/routes/_authenticated/admin/visual.tsx`):**
   - Em `saveTexts()` e `saveOrder()`: após o salvamento com sucesso no banco, despachar em background:
     ```ts
     void submitToIndexNow([`${CANONICAL_BASE_URL}/`]);
     ```

### D. Script de Submissão em Massa (`scripts/indexnow-bulk.ts`)
- Script executável com `bun scripts/indexnow-bulk.ts`.
- Lê o sitemap dinâmico já existente (`generateSitemapXml()` ou `https://portfolio.goteamgoagency.com/sitemap.xml`), extrai todas as tags `<loc>`, valida e deduplica a lista de URLs e despacha um único POST para a API do IndexNow.
- Exibe feedback claro no terminal com a quantidade de URLs sincronizadas e o status da submissão.

### E. Testes Unitários (`src/lib/indexnow.test.ts`)
- Testes cobrindo:
  - Formatação e estruturação correta do payload.
  - Tratamento de URLs vazias ou duplicadas.
  - Resiliência a falhas de rede (garantia de não propagação de erros não tratados).

### F. Documentação Viva & Histórico
- Atualizar `CERNE.md` registrando o subsistema IndexNow e pontos de disparo.
- Registrar `TASK-053` no `BACKLOGER.md` com escopo, arquivos modificados e status.

---

## 3. Plano de Testes & Validação
1. Executar `vitest run` para garantir que todos os testes (anteriores e novos) passem com 100% de sucesso.
2. Executar `npm run lint` para validação de estilo e regras ESLint.
3. Executar `npm run build` para garantir a integridade do bundle de produção.
4. Executar um teste do script `scripts/indexnow-bulk.ts` em ambiente local.

---

## 4. Solicitação de Aprovação Prévia

Conforme o protocolo do projeto estabelecido em `AGENTS.md` (item 2), este plano está submetido para avaliação. **Nenhuma alteração em código foi realizada**. Aguardo sua aprovação explícita para iniciar a implementação.
