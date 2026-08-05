# Sport Scout Hub

# MVP — Plataforma de Gestão para Agência de Intercâmbio Esportivo

> [!IMPORTANT]
> ## PROTOCOLO OBRIGATÓRIO DE GOVERNANÇA PARA INTELIGÊNCIAS ARTIFICIAIS (IAs)
> 
> Qualquer agente de IA atuando neste repositório **DEVE OBRIGATORIAMENTE** seguir este protocolo:
> 
> 1. **LEITURA OBRIGATÓRIA**: Antes de tomar qualquer ação ou responder, a IA deve ler integralmente o [`README.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/README.md), a documentação viva [`CERNE.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/CERNE.md), o diário de bordo [`BACKLOGER.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/BACKLOGER.md) e as diretrizes de interface [`UI&UX.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/UI&UX.md).
> 2. **PLANEJAMENTO E APROVAÇÃO HUMANA**: **NENHUMA** alteração de código (inclusão, alteração ou exclusão) pode ser executada sem primeiro apresentar um plano detalhado e receber a **aprovação explícita de um usuário humano**.
> 3. **DOCUMENTAÇÃO VIVA (`CERNE.md`)**: Toda alteração de código (funções, componentes, rotas, telas ou modelos) deve ser imediatamente registrada em detalhes no arquivo [`CERNE.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/CERNE.md).
> 4. **REGISTRO DE DEMANDAS (`BACKLOGER.md`)**: Todas as solicitações devem ser registradas no [`BACKLOGER.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/BACKLOGER.md), contendo o que foi pedido, data/hora, solicitante, executor e status (`[CONCLUÍDO]` ou `[PENDENTE]`).
> 5. **DESIGN SYSTEM & MOBILE-FIRST (`UI&UX.md`)**: Toda interface deve obrigatoriamente respeitar as diretrizes de UI/UX, acessibilidade e mobile-first documentadas em [`UI&UX.md`](file:///c:/Users/kauan/OneDrive/%C3%81rea%20de%20Trabalho/dev%202.0/teamgo/dream-athletic-path/UI&UX.md).

## Papel da IA

Atue como um **Software Architect**, **Senior Full Stack Engineer**, **Product Manager**, **UX/UI Designer** e **Especialista em Segurança**, responsável por projetar e desenvolver uma plataforma moderna, escalável e preparada para evolução contínua.

Seu objetivo **não é apenas programar**, mas também tomar decisões arquiteturais consistentes, documentando cada uma delas.

---

> [!WARNING]
> ## ⚠️ OBRIGATÓRIO: Package Manager
>
> **Este projeto usa exclusivamente [Bun](https://bun.sh) como package manager.**  
> **NÃO use npm, yarn ou pnpm** — você encontrará erros de build e dependências incompatíveis.
>
> **Instalação do Bun**: https://bun.sh/docs/installation
>
> ```bash
> # Windows (PowerShell):
> powershell -c "irm bun.sh/install.ps1|iex"
>
> # macOS/Linux:
> curl -fsSL https://bun.sh/install | bash
> ```
>
> **Verificar instalação**:
> ```bash
> bun --version  # Deve retornar >= 1.3.14
> ```

---

## 🚀 Quick Start

### Pré-requisitos

- **[Bun](https://bun.sh)** >= 1.3.14 *(obrigatório)*
- **Node.js** >= 20.19.0 *(LTS 22 recomendado)*
- **Supabase** — Projeto externo configurado (veja [`docs/SETUP.md`](docs/SETUP.md))

### Instalação

```bash
# 1. Instalar dependências
bun install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite .env e preencha as credenciais do Supabase

# 3. Aplicar migrations no Supabase SQL Editor
# Execute cada arquivo em db/migrations/ na ordem numérica
```

### Comandos Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `bun run dev` | Inicia servidor de desenvolvimento (http://localhost:3000) |
| `bun run build` | Compila aplicação para produção |
| `bun run preview` | Preview da build de produção localmente |
| `bun run typecheck` | Verifica erros de TypeScript sem compilar |
| `bun run lint` | Executa ESLint em todo o projeto |
| `bun run test` | Executa testes unitários com Vitest |
| `bun run validate` | **Executa lint + typecheck + test + build** (pré-deploy) |

**Para deploy em Vercel/Netlify/Cloudflare**, consulte [`docs/SETUP.md`](docs/SETUP.md) para configuração detalhada.

---

## 🔧 Troubleshooting

### ❌ "bun: command not found"

**Causa**: Bun não está instalado ou não está no PATH.

**Solução**:
```bash
# Instale o Bun seguindo o guia oficial
# Windows PowerShell:
powershell -c "irm bun.sh/install.ps1|iex"

# macOS/Linux:
curl -fsSL https://bun.sh/install | bash

# Verifique a instalação:
bun --version
```

### ❌ `npm ERR!` ou `yarn error` ao executar comandos

**Causa**: Você está usando o package manager errado.

**Solução**: Este projeto **requer Bun**. Substitua todos os comandos:
- ❌ `npm install` → ✅ `bun install`
- ❌ `npm run dev` → ✅ `bun run dev`
- ❌ `npm run build` → ✅ `bun run build`

### ❌ Erros de compilação TypeScript

**Causa**: Código TypeScript com erros de tipo ou dependências desatualizadas.

**Diagnóstico**:
```bash
# Verifique erros detalhados:
bun run typecheck

# Se houver muitos erros, pode ser problema de dependências:
rm -rf node_modules bun.lockb
bun install
```

### ❌ `bun run build` falha silenciosamente

**Causa**: Erros de lint, typecheck ou testes bloqueando a build.

**Diagnóstico progressivo**:
```bash
# 1. Verificar linting:
bun run lint

# 2. Verificar tipos:
bun run typecheck

# 3. Verificar testes:
bun run test

# 4. Executar validação completa:
bun run validate
```

### ❌ Dependências faltando ou versões incompatíveis

**Causa**: Lock file desatualizado ou instalação parcial.

**Solução**:
```bash
# Re-instalar dependências limpando cache:
rm -rf node_modules bun.lockb
bun install

# Verificar se todas as dependências foram instaladas:
bun run typecheck
```

### ❌ Erro "Cannot find module" em imports

**Causa**: Path alias `@/` não resolvido ou arquivo movido/renomeado.

**Solução**:
1. Verifique se `tsconfig.json` tem o path alias configurado:
   ```json
   {
     "compilerOptions": {
       "paths": { "@/*": ["./src/*"] }
     }
   }
   ```
2. Reinicie o TypeScript server no VS Code: `Ctrl+Shift+P` → "TypeScript: Restart TS Server"

### ❌ Deploy na Vercel falha com `npm warn ERESOLVE`

**Causa**: Vercel está usando npm em vez de Bun para instalar dependências.

**Sintomas no build log**:
```
npm warn ERESOLVE overriding peer dependency
npm warn Found: vite@8.1.5
npm warn Could not resolve dependency:
npm warn peerOptional vite@"^5.0.0 || ^6.0.0 || ^7.0.0-0"
```

**Solução**:
1. Verifique que o arquivo [`vercel.json`](vercel.json) existe na raiz do projeto
2. Conteúdo esperado:
   ```json
   {
     "buildCommand": "bun run build",
     "installCommand": "bun install",
     "framework": null,
     "outputDirectory": ".output"
   }
   ```
3. No dashboard da Vercel, vá em **Project Settings → General → Build & Development Settings**
4. Verifique que:
   - **Install Command**: `bun install`
   - **Build Command**: `bun run build`
5. Se ainda usar npm, delete o cache: **Project Settings → General → Reset Cache**
6. Faça novo deploy e verifique no log:
   - ✅ Deve aparecer `Running "bun install"`
   - ❌ NÃO deve aparecer `npm install` ou `npm warn`

**Para detalhes**, consulte [`docs/SETUP.md`](docs/SETUP.md) seção "⚠️ CRÍTICO: Configuração do Package Manager na Vercel".

---

# Regras obrigatórias

## Infraestrutura

### NÃO utilizar o Lovable Cloud

Em hipótese alguma utilize:

- Banco de dados do Lovable;

- Supabase criado automaticamente pelo Lovable;

- Deploy realizado pelo Lovable.

### OBRIGATÓRIO

O projeto deverá utilizar exclusivamente:

- Um projeto **Supabase externo**, que será fornecido posteriormente.

- Todas as tabelas deverão ser criadas nesse Supabase.

- Toda autenticação deverá utilizar esse Supabase.

- Todo Storage deverá utilizar esse Supabase.

- Todas as Edge Functions deverão utilizar esse Supabase.

A arquitetura deve ser preparada para funcionar totalmente fora do ecossistema do Lovable.

---

# Deploy

A aplicação deverá ser preparada para deploy externo.

Não utilizar nenhum recurso proprietário do Lovable que impeça a migração.

O projeto deverá estar preparado para hospedagem em plataformas como:

- Vercel

- Netlify

- Cloudflare

- AWS

- ou qualquer ambiente compatível.

---

# Objetivo da plataforma

Construir uma plataforma onde uma **Agência de Intercâmbio Esportivo** gerencia atletas e disponibiliza seus perfis para coaches internacionais.

A plataforma possuirá três tipos de usuários.

---

# Perfis de acesso

## 1. Agência (Administrador)

Este é o perfil mais importante do sistema.

A Agência é proprietária de toda a plataforma.

Ela possui controle total sobre:

- criação de atletas;

- edição de atletas;

- exclusão de atletas;

- criação de coaches;

- gerenciamento de pipeline;

- gerenciamento de documentos;

- gerenciamento de destaques;

- gerenciamento do feed público;

- gerenciamento de posições;

- gerenciamento das etapas;

- gerenciamento das notificações.

### Apenas a Agência pode criar atletas.

O atleta **NÃO** pode realizar cadastro.

Fluxo esperado:

1. Agência cria o perfil.

2. Sistema envia convite.

3. Atleta recebe acesso.

4. Atleta complementa apenas as informações permitidas.

---

## 2. Atleta

O atleta possui acesso apenas ao próprio perfil.

Ele poderá:

- editar informações permitidas;

- alterar foto;

- enviar documentos;

- enviar vídeos;

- enviar fotos;

- acompanhar seu pipeline;

- visualizar próximas etapas;

- visualizar pendências;

- visualizar contratos;

- visualizar checklist de documentos;

- receber notificações.

Nunca poderá:

- criar outro atleta;

- visualizar outros atletas;

- alterar informações administrativas.

---

## 3. Coach

O Coach possui acesso apenas ao catálogo público.

Ele poderá:

- navegar pelos atletas;

- pesquisar atletas;

- filtrar atletas;

- abrir o perfil público;

- visualizar vídeos;

- visualizar fotos;

- visualizar conquistas;

- visualizar estatísticas.

Não terá acesso a:

- documentos;

- pipeline;

- contratos;

- dados internos;

- informações administrativas.

---

# Feed Público

O sistema deverá possuir um feed público.

Sem necessidade de login.

Este feed funcionará como um catálogo de atletas.

O visual deve lembrar plataformas como:

- Netflix

- Spotify

- Apple TV

Ou seja:

cards grandes

foto

vídeo

destaques

boa navegação

---

# Perfil Público do Atleta

Cada atleta deverá possuir uma URL pública própria.

Exemplo:

```

/athlete/joao-silva

```

Essa URL deverá ser compartilhável.

O perfil poderá conter:

- foto

- vídeos

- posição

- altura

- peso

- idade

- nacionalidade

- conquistas

- medalhas

- estatísticas

- descrição

- galeria

Apenas informações autorizadas pela Agência poderão aparecer.

---

# Perfis privados

As seguintes áreas deverão exigir autenticação:

Área do atleta

Área da agência

Documentos

Pipeline

Contratos

Checklist

Uploads

Configurações

---

# Pipeline do atleta

Cada atleta passará por um fluxo composto por etapas.

As etapas serão informadas posteriormente.

Os nomes originais deverão ser preservados em inglês.

Caso exista tradução para português, utilizar sistema multilíngue.

Cada etapa poderá conter:

- descrição

- prazo

- checklist

- documentos obrigatórios

- observações

- responsável

---

# Upload de documentos

Cada etapa poderá exigir uploads.

Exemplos:

- PDF

- JPG

- PNG

- MP4

- MOV

- DOC

- DOCX

Os arquivos deverão ser armazenados no Supabase Storage.

A Agência poderá:

- visualizar

- baixar

- aprovar

- reprovar

- solicitar novo envio

O atleta poderá:

- visualizar solicitações

- enviar arquivos

- reenviar arquivos

---

# Checklist

Cada etapa poderá possuir checklist.

Exemplo:

- Passaporte

- Histórico escolar

- Vídeo de apresentação

- Documento X

- Documento Y

Cada item poderá possuir:

- status

- data

- observação

- upload correspondente

---

# Integração com Resend

Integrar com Resend.

Todos os disparos deverão ser feitos através de um serviço centralizado.

Exemplos:

- boas-vindas

- criação de conta

- alteração de etapa

- solicitação de documentos

- aprovação

- reprovação

- recuperação de senha

O conteúdo dos e-mails será desenvolvido posteriormente.

Neste momento, apenas preparar a arquitetura.

---

# Segurança

Utilizar:

Supabase Auth

Login por:

- e-mail

- senha

Neste MVP não utilizar:

Google

Facebook

Apple

Microsoft

GitHub

Implementar:

- Row Level Security (RLS)

- políticas por perfil

- proteção de rotas

- validação de permissões

- boas práticas de segurança

---

# Banco de Dados

Estruturar pensando em escalabilidade.

Evitar retrabalho.

Criar entidades bem normalizadas.

Espera-se algo semelhante a:

- users

- agencies

- athletes

- coaches

- athlete_profiles

- athlete_media

- achievements

- pipeline_stages

- athlete_stage_progress

- stage_checklists

- checklist_items

- documents

- notifications

- emails

- positions

- countries

Caso seja necessário criar novas tabelas, fique à vontade.

---

# Interface

A interface deverá ser:

- moderna

- elegante

- limpa

- premium

- minimalista

Princípios:

- Mobile First

- Responsiva

- Excelente UX

- Excelente UI

- Alta performance

A identidade visual será fornecida posteriormente.

Portanto:

utilize componentes facilmente customizáveis.

---

# Arquitetura

Utilizar boas práticas.

Separar:

- componentes

- páginas

- hooks

- serviços

- providers

- helpers

- types

- schemas

- validações

Evitar código monolítico.

Priorizar escalabilidade.

---

# MVP

Neste primeiro momento, desenvolver apenas:

- autenticação

- estrutura base

- banco de dados

- dashboards iniciais

- perfis

- pipeline inicial

- uploads

- estrutura de notificações

- integração preparada com Resend

Não implementar funcionalidades avançadas antes da aprovação.

---

# Processo de desenvolvimento

Após concluir cada grande etapa:

1. Pare o desenvolvimento.

2. Explique o que foi criado.

3. Mostre as decisões arquiteturais.

4. Aguarde aprovação antes de continuar.

Nunca avance automaticamente para a próxima fase.

---

# Objetivo principal

Antes de escrever qualquer linha de código, projete uma arquitetura sólida.

Priorize:

- organização;

- segurança;

- escalabilidade;

- manutenção;

- performance;

- experiência do usuário.

Sempre que identificar uma melhoria arquitetural ou funcional que agregue valor ao projeto, proponha essa melhoria antes de implementá-la, explicando seus benefícios e os impactos técnicos.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e916693e-7268-439d-8d03-9b66d6ea5c2c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Para configurar o ambiente, aplicar as migrations e criar o primeiro
administrador, consulte [`docs/SETUP.md`](docs/SETUP.md).

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
