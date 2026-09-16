# Plano de Implementação: TASK-063 — Hotfix RLS Migration 018 + Redesign de E-mail + Filtros Avançados de Destinatários + Otimização de Importação em Massa

- **ID da Tarefa:** TASK-063
- **Data/Hora:** 2026-09-09 15:30
- **Solicitante:** Kauan / Usuário Humano
- **Executor:** Antigravity AI / Gemini Coding Agent
- **Status:** [PENDENTE DE APROVAÇÃO HUMANA]

---

## 1. Visão Geral & Contexto

A feature de Universidades e Mailer (TASK-062, migration `0018_universities_and_mailer.sql`) estabeleceu a base estruturada para envio de e-mails de recrutamento a coaches universitários. A TASK-063 resolve 4 itens prioritários de evolução e estabilidade:

1. **PARTE 1 — Hotfix RLS Migration (Bloqueante):**
   - Criar `db/migrations/0019_fix_universities_rls_role_reference.sql` substituindo a referência incorreta a `profiles.role` pela função canônica `public.is_agency_admin()`.
   - Ajustar `0018_universities_and_mailer.sql` para garantir que `grep -rn "profiles.role" db/migrations/` resulte em zero ocorrências.
2. **PARTE 2 — Redesign dos Templates de E-mail (Identidade Visual Oficial):**
   - Refatorar `src/lib/email/recruit-email-template.ts` (atleta individual) e `src/lib/email/recruit-email-catalog-template.ts` (catálogo institucional) para a paleta oficial da agência (`#f8faf5`, `#ffffff`, `#032812`, `#4b6353`, `#084323`, `#f69e00`, `#e3e9dc`).
   - Eliminar 100% dos resquícios da paleta escura antiga (`#0b0b0c`, `#059669`, `#18181b`, `#141416`, `#26262a`).
   - Preservar a estrutura de conteúdo, tags dinâmicas, formatações imperiais e links com CSS inline para compatibilidade com clientes de e-mail.
3. **PARTE 3 — Filtros Avançados de Destinatários no Mailer:**
   - Adicionar mapa oficial de regiões dos EUA por estado (`REGION_BY_STATE`) em `src/lib/universities-constants.ts`.
   - Adicionar filtros `filterBudget`, `filterToefl` e `filterRegion` em `src/routes/_authenticated/admin/mailer.tsx`.
   - Garantir combinação em `AND` estrita entre todos os filtros na lista e na ação de seleção em massa (`selectAllFiltered`).
4. **PARTE 4 — Otimização de Importação em Massa de Universidades:**
   - Otimizar `handleConfirmImport` em `src/routes/_authenticated/admin/universities.tsx`.
   - Substituir selects sequenciais N+1 por uma única busca prévia de todas as universidades em memória com indexação via `Map`.
   - Executar operações de escrita (inserts/updates) em lotes concorrentes (chunks de 25 com `Promise.all`), mantendo a integridade da deduplicação de coaches por e-mail.

---

## 2. Detalhamento Técnico das 4 Partes

### PARTE 1: Hotfix RLS (Migration 0019)

#### 1.1 Causa Raiz

Na migration `0018_universities_and_mailer.sql`, as policies de `universities` e `email_suppressions` tentavam ler `profiles.role = 'agency_admin'`. Porém, a tabela `public.profiles` contém apenas metadados de perfil (`id`, `full_name`, `avatar_url`, `locale`). As roles do sistema ficam isoladas em `public.user_roles` e são consultadas pela função segura `public.is_agency_admin()`.

#### 1.2 Ações Planejadas

1. Criar `db/migrations/0019_fix_universities_rls_role_reference.sql`:
   ```sql
   -- TASK-063: Hotfix de RLS para universities e email_suppressions
   -- Substitui a consulta inválida a profiles.role pela função canônica public.is_agency_admin()

   drop policy if exists "Agency admin full access on universities" on public.universities;
   create policy "Agency admin full access on universities"
     on public.universities for all
     to authenticated
     using (public.is_agency_admin())
     with check (public.is_agency_admin());

   drop policy if exists "Agency admin full access on email_suppressions" on public.email_suppressions;
   create policy "Agency admin full access on email_suppressions"
     on public.email_suppressions for all
     to authenticated
     using (public.is_agency_admin())
     with check (public.is_agency_admin());
   ```
2. Atualizar também as linhas correspondentes em `0018_universities_and_mailer.sql` para que novas instalações a partir do zero não quebrem e para satisfazer o critério de aceite:
   `grep -rn "profiles.role" db/migrations/` => 0 ocorrências.

---

### PARTE 2: Redesign do E-mail (Identidade Visual Oficial)

#### 2.1 Especificação de Cores e Tokens

| Elemento                                  | Cor Oficial                                       | Propósito                                  |
| :---------------------------------------- | :------------------------------------------------ | :----------------------------------------- |
| **Envelope / Body (Fundo Externo)**       | `#f8faf5`                                         | Fundo suave, claro e elegante              |
| **Card / Container Central**              | `#ffffff`                                         | Área limpa de leitura e alto contraste     |
| **Texto Principal / Títulos**             | `#032812`                                         | Verde floresta profundo, contraste máximo  |
| **Texto Secundário / Labels / Legendas**  | `#4b6353`                                         | Verde médio harmonioso e legível           |
| **Badges Secundários (Posição / Status)** | Fundo `#084323`, Texto `#ffffff`                  | Pílulas sólidas elegantes de destaque      |
| **CTA Principal / Borda Foto / Destaque** | Fundo `#f69e00`, Texto `#032812`                  | Dourado vibrante da marca com texto escuro |
| **Bordas e Linhas Divisórias**            | `#e3e9dc`                                         | Separações sutis de alta precisão          |
| **Cards de Estatísticas (Grid 2x2)**      | Fundo `#f8faf5`, Borda `#e3e9dc`                  | Caixas de métricas biométricas/acadêmicas  |
| **Rodapé Institucional**                  | Fundo `#f0f4ec`, Borda `#e3e9dc`, Texto `#4b6353` | Informações legais e link de unsubscribe   |

#### 2.2 Template 1: `recruit-email-template.ts` (Atleta Individual)

- Header com pílula institucional `GO TEAM GO • SCOUTING SHOWCASE` em `#084323` com texto `#ffffff`.
- Foto do atleta redonda (140x140) com borda de 3px em `#f69e00` e sombra dourada sutil.
- Nome do atleta em `#032812` (26px, bold).
- Pílula de Esporte e Posição com fundo `#084323` e texto `#ffffff`.
- Bloco Hook Line em `#f8faf5` com borda tracejada em `#e3e9dc`, texto itálico em `#032812`.
- Grid 2x2 de métricas: Height, Nationality, Graduation, Status/Academic com fundo `#f8faf5` e borda `#e3e9dc`.
- Botão CTA: `View Full Profile & Highlights →` com fundo `#f69e00`, texto `#032812` (bold), raio de 10px e sombra suave.
- Rodapé institucional em `#f0f4ec`, links com cor `#084323` e unsubscribe em `#4b6353`.

#### 2.3 Template 2: `recruit-email-catalog-template.ts` (Catálogo Geral)

- Barra superior de acento em gradiente dourado (`#f69e00` a `#e08f00`).
- Header institucional em `#f8faf5` com badge `2025 / 2026 ROSTER` em `#084323` e texto `#ffffff`.
- Saudação e Headline em `#032812`, mensagem introdutória em `#4b6353`.
- 3 Pillar Cards (Verified Video, Academic Track, Fast Placement) em `#f8faf5` com bordas `#e3e9dc`, títulos em `#084323` e corpo em `#4b6353`.
- Banner de modalidades em `#f8faf5` com borda `#e3e9dc`.
- Botão CTA: `Explore Full Athlete Roster & Highlights →` com fundo `#f69e00`, texto `#032812`.
- Rodapé institucional compatível com a paleta clara.

#### 2.4 Amostra Renderizada de Teste (Preview dos Templates)

_(Será anexada no final do plano para conferência visual)_.

---

### PARTE 3: Filtros Avançados de Destinatários (`mailer.tsx` e `universities-constants.ts`)

#### 3.1 Mapeamento Regional (`universities-constants.ts`)

Criar o mapeamento padrão do US Census Bureau para todos os 50 estados americanos + DC:

```ts
export type USRegion = "Northeast" | "Midwest" | "South" | "West";

export const US_REGIONS: USRegion[] = ["Northeast", "Midwest", "South", "West"];

export const REGION_BY_STATE: Record<string, USRegion> = {
  // Northeast (9)
  CT: "Northeast",
  ME: "Northeast",
  MA: "Northeast",
  NH: "Northeast",
  RI: "Northeast",
  VT: "Northeast",
  NJ: "Northeast",
  NY: "Northeast",
  PA: "Northeast",
  // Midwest (12)
  IL: "Midwest",
  IN: "Midwest",
  MI: "Midwest",
  OH: "Midwest",
  WI: "Midwest",
  IA: "Midwest",
  KS: "Midwest",
  MN: "Midwest",
  MO: "Midwest",
  NE: "Midwest",
  ND: "Midwest",
  SD: "Midwest",
  // South (16 + DC)
  DE: "South",
  FL: "South",
  GA: "South",
  MD: "South",
  NC: "South",
  SC: "South",
  VA: "South",
  WV: "South",
  AL: "South",
  KY: "South",
  MS: "South",
  TN: "South",
  AR: "South",
  LA: "South",
  OK: "South",
  TX: "South",
  DC: "South",
  // West (13)
  AZ: "West",
  CO: "West",
  ID: "West",
  MT: "West",
  NV: "West",
  NM: "West",
  UT: "West",
  WY: "West",
  AK: "West",
  CA: "West",
  HI: "West",
  OR: "West",
  WA: "West",
};
```

#### 3.2 Estados e Enriquecimento em `RecipientItem` (`mailer.tsx`)

1. Estender a interface `RecipientItem`:
   ```ts
   interface RecipientItem {
     ...
     budgetLevel: UniversityBudgetLevel | null;
     toeflLevel: UniversityToeflLevel | null;
     region: USRegion | null;
   }
   ```
2. Adicionar os estados de filtro no componente:
   ```ts
   const [filterBudget, setFilterBudget] = useState<string>("all");
   const [filterToefl, setFilterToefl] = useState<string>("all");
   const [filterRegion, setFilterRegion] = useState<string>("all");
   ```
3. Lógica estrita de combinação em `AND` dentro de `filteredRecipients`:
   ```ts
   if (filterState !== "all" && item.universityState !== filterState) return false;
   if (filterLeague !== "all" && item.league !== filterLeague) return false;
   if (filterHbcu === "hbcu" && !item.isHbcu) return false;
   if (filterHbcu === "non_hbcu" && item.isHbcu) return false;
   if (filterBudget !== "all" && item.budgetLevel !== filterBudget) return false;
   if (filterToefl !== "all" && item.toeflLevel !== filterToefl) return false;
   if (filterRegion !== "all" && item.region !== filterRegion) return false;
   ```
4. As funções `selectAllFiltered()` e `deselectAllFiltered()` já operam sobre `filteredRecipients`, mantendo o comportamento correto onde marcar/desmarcar em massa respeita todos os 6 filtros combinados simultaneamente.
5. Inclusão dos novos `<select>` no grid de filtros da interface com layout responsivo.

---

### PARTE 4: Otimização de Importação em Massa (`universities.tsx`)

#### 4.1 Problema Atual

A função `handleConfirmImport` atual executa:

```ts
for (const [key, uniData] of uniMap.entries()) {
  const { data: existing } = await supabase.from("universities").select(...); // 1 requisição
  if (existing) {
    await supabase.from("universities").update(...); // +1 requisição
  } else {
    await supabase.from("universities").insert(...); // +1 requisição
  }
}
```

Para planilhas grandes (ex: 3.500 contatos de coaches), essa abordagem sequencial resulta em milhares de requisições individuais consecutivas (N+1), levando muitos minutos e correndo risco de timeout ou sobrecarga de conexões.

#### 4.2 Nova Estratégia Otimizada (Memória + Lotes Paralelos)

1. **Busca Prévia Ampla (1 única requisição):**
   ```ts
   const { data: allExisting } = await supabase
     .from("universities")
     .select("id, name, state, coaches");
   ```
2. **Indexação Local via `Map`:**
   Mapear as universidades existentes usando a mesma chave canônica:
   `const existingMap = new Map<string, ExistingUniversity>();`
   Chave: `${uni.name.toLowerCase().trim()}_${uni.state.toUpperCase().trim()}`
3. **Classificação em Memória:**
   Comparar `uniMap` contra `existingMap`.
   - Se existir: mesclar a lista de coaches (deduplicando por e-mail em lowercase) e adicionar à lista `toUpdate`.
   - Se não existir: adicionar à lista `toInsert`.
4. **Execução em Lotes Concorrentes (Batching Paralelo):**
   Processar `toInsert` e `toUpdate` em lotes de 25 registros simultâneos com `Promise.all`:
   ```ts
   const BATCH_SIZE = 25;
   for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
     const chunk = toUpdate.slice(i, i + BATCH_SIZE);
     await Promise.all(
       chunk.map((item) =>
         supabase
           .from("universities")
           .update({ coaches: item.coaches, updated_at: new Date().toISOString() })
           .eq("id", item.id),
       ),
     );
   }
   ```
   Para os `toInsert`, inserir em lotes de até 25 por chamada:
   ```ts
   for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
     const chunk = toInsert.slice(i, i + BATCH_SIZE);
     await supabase.from("universities").insert(chunk);
   }
   ```
5. **Resultado:**
   Redução de ~7.000 requisições sequenciais para apenas ~1 consulta inicial + poucos batches paralelos, diminuindo o tempo de importação de 10 minutos para poucos segundos, sem risco de duplicidade de universidades ou coaches.

---

## 3. Planilha de Conferência Visual do E-mail (Preview HTML)

### Exemplo do E-mail Individual Renderizado:

```html
<table style="background-color:#f8faf5;padding:32px 12px;">
  <tr>
    <td align="center">
      <table
        style="max-width:580px;background-color:#ffffff;border:1px solid #e3e9dc;border-radius:16px;"
      >
        <!-- Header com pílula #084323 -->
        <!-- Foto circular com border 3px solid #f69e00 -->
        <!-- Nome em #032812 -->
        <!-- Badge esporte/posição com fundo #084323 e texto #ffffff -->
        <!-- Hook em fundo #f8faf5 e borda #e3e9dc -->
        <!-- Grid 2x2 com cards em #f8faf5 e borda #e3e9dc -->
        <!-- Botão CTA em #f69e00 com texto #032812 -->
        <!-- Rodapé em #f0f4ec com texto #4b6353 e links #084323 -->
      </table>
    </td>
  </tr>
</table>
```

---

## 4. Critérios de Aceite & Verificação

1. **PARTE 1:**
   - `0019_fix_universities_rls_role_reference.sql` criado e válido.
   - `grep -rn "profiles.role" db/migrations/` retorna 0 ocorrências.
2. **PARTE 2:**
   - Templates `recruit-email-template.ts` e `recruit-email-catalog-template.ts` 100% atualizados.
   - Verificação com grep por `#0b0b0c`, `#059669`, `#18181b`, `#141416`, `#26262a` retorna zero ocorrências em ambos os arquivos.
   - Preview no iframe de `/admin/mailer` reflete a nova paleta clara.
3. **PARTE 3:**
   - Filtros Budget, TOEFL e Região ativos e combinando em `AND`.
   - Seleção em massa respeita estritamente o conjunto filtrado visível.
4. **PARTE 4:**
   - Importação de universidades em massa realiza pré-carregamento com Map e batching paralelo.
   - Testes com registros novos e repetidos preservam a deduplicação de coaches por e-mail.
5. **Governança & Qualidade:**
   - `npm run validate` e `compile_applet` executando sem erros.
   - Atualização de `CERNE.md` e `BACKLOGER.md`.

---

## 5. Próximo Passo

Aguardar aprovação explícita do usuário humano para iniciar a execução das alterações no código.
