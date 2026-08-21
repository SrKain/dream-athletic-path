# Planejamento: Refatoração do Hero da Página do Atleta para "Luxo Minimalista"

**Data:** 2026-08-20 19:08  
**Status:** `[CONCLUÍDO]`  
**Solicitante:** Kauan  
**Executor:** Antigravity AI  

---

## 1. Diagnóstico do Estado Atual vs. Visão "Luxo Minimalista"

### ❌ Problemas no Modelo Atual (Sobrecarga Visual):
- **Excesso de caixas e mini-cards:** 6 chips com ícones coloridos comprimidos dentro de uma caixa escura (*glass-dark*), criando poluição visual e sensação de formulário/dashboard em vez de um perfil de alto padrão.
- **Competição de elementos:** Múltiplas badges de cores diferentes (verde limão, âmbar, branco), 3 botões pesados agrupados e excesso de bordas/anéis.
- **Ruptura de identidade com a Home:** A Home/Catálogo adota um tom sóbrio de verde esmeralda profundo (`#061b13`), tipografia editorial refinada (`#f4f7e9`) e amplo respiro visual. O hero atual do atleta estava muito carregado.

---

## 2. Proposta de Arquitetura Visual — "Luxo Minimalista" (Quiet Luxury)

A nova experiência do Hero seguirá os princípios de editorial esportivo de elite (ex: *Monocle, Kinfolk, Vogue Sports, Ivy League / Premier Agency*):

### ✨ Pilares do Redesign:

1. **Atmosfera & Fundo Imersivo Sóbrio:**
   - Fundo com a paleta nobre do catálogo (`from-[#061b13] via-[#04160f] to-[#020b07]`) com iluminação ambiente sutil e textura suave.
   - Vídeo de fundo mantido com opacidade calibrada e overlay sedoso, sem poluição visual.

2. **Tipografia Editorial & Destaque do Atleta:**
   - **Remoção da `<div>` de Badges/Tags Aglomeradas:** Eliminação completa do bloco superior de tags (`Verified Recruit`, país em pílula, tag de oportunidades) que fragmentavam a leitura e poluíam o cabeçalho.
   - **Nome do Atleta em Grande Escala:** `font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight text-[#f4f7e9]` com leitura fluida e presença imponente direta no topo.
   - **Subtítulo & Posicionamento Refinado:** Frase de posicionamento em tom suave (`text-[#b9c4bc]`), elegante e espaçada.
   - **Localização e Posição Integradas com Discrição:** Linha editorial discreta abaixo do nome/subtítulo, sem sobrecarga visual.

3. **Linha Editorial de Métricas (Sem caixas claustrofóbicas):**
   - Em vez de 6 caixinhas com bordas, as métricas biométricas e acadêmicas serão dispostas em uma **linha/grade editorial limpa e horizontal**, com divisores finos e tipografia nítida:
     - **Altura & Peso:** `6'2" (188 cm) · 175 lbs (79 kg)`
     - **Posição & Elegibilidade:** `Outside Hitter · 4 Seasons Eligibility`
     - **Acadêmico:** `GPA 3.8 · Class of 2026`

4. **Foto do Atleta com Acabamento Premium:**
   - Proporção elegante 4:5 ou 3:4 com chanfro/borda sutil em degradê dourado/esmeralda ultrafino, sombra cinematográfica e badge de posição discreto.

5. **Call-to-Actions (CTAs) de Alto Nível:**
   - **Botão Primário:** `Recruit Athlete` (estilo Liquid Gold/Emerald com acabamento de luxo e toque tátil superior a 44px).
   - **Ações Secundárias:** Botões minimalistas refinados para `Watch Film` (com ícone play sutil) e `Fact Sheet`.

---

## 3. Arquivos Envolvidos

1. `src/routes/athlete.$slug.tsx` — Refatoração da seção Hero com foco em tipografia, espaçamento e remoção do excesso de containers/caixas.
2. `CERNE.md` — Atualização da documentação viva dos componentes e rotas.
3. `BACKLOGER.md` — Registro da tarefa com status e entregáveis.

---

## 4. Plano de Validação
- Verificação de contraste de acessibilidade WCAG AA (texto `#f4f7e9` sobre `#061b13`).
- Responsividade total (mobile vertical, tablet e desktop ultra-wide).
- Execução de linter (`npm run lint`), build de produção (`npm run build`) e testes unitários (`vitest`).
