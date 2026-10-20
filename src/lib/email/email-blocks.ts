import {
  buildDefaultEmailBlocks,
  sanitizeEmailBlocks,
  type EmailBlock,
} from "./personal-email-renderer";

export type { EmailBlock };

export interface AssertEmailIntegrityOptions {
  mode?: "single_athlete" | "multi_athlete" | "catalog";
  expectedAthleteIds?: string[];
  renderedAthleteIds?: string[];
  missingAthleteIds?: string[];
  html: string;
  text: string;
}

/**
 * Reconcilia de forma pura e determinística os blocos do composer com a lista de atletas selecionados.
 *
 * Regras:
 * 1. Todos os blocos de texto (saudação, notas personalizadas, fechamento) são preservados.
 * 2. Blocos de atleta que não pertencem a `athleteIds` são removidos.
 * 3. Se houver apenas 1 atleta selecionado e existia 1 bloco de atleta anterior diferente,
 *    substitui a referência no mesmo lugar (mantendo a posição relativa aos textos).
 * 4. Atletas de `athleteIds` que ainda não constam nos blocos são inseridos ordenadamente.
 *    Se houver bloco de texto final (fechamento), insere antes dele; caso contrário, ao final.
 * 5. Se não houver blocos válidos, retorna `buildDefaultEmailBlocks(athleteIds)`.
 */
export function reconcileEmailBlocks(
  prevBlocks: EmailBlock[] | null | undefined,
  athleteIds: string[],
): EmailBlock[] {
  const sanitized = sanitizeEmailBlocks(prevBlocks);
  const cleanAthleteIds = Array.from(
    new Set(
      (athleteIds || []).filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      ),
    ),
  );

  if (cleanAthleteIds.length === 0) {
    // Modo sem atletas: mantém apenas os textos
    return sanitized.filter((b) => b.type === "text");
  }

  if (sanitized.length === 0) {
    return buildDefaultEmailBlocks(cleanAthleteIds);
  }

  // Caso especial individual: se houver exatamente 1 atleta selecionado
  // e existia 1 único bloco de atleta anterior, substitui diretamente no mesmo índice.
  const athleteBlockIndices: number[] = [];
  sanitized.forEach((b, idx) => {
    if (b.type === "athlete") athleteBlockIndices.push(idx);
  });

  if (cleanAthleteIds.length === 1 && athleteBlockIndices.length === 1) {
    const targetId = cleanAthleteIds[0];
    return sanitized.map((b, idx) => {
      if (idx === athleteBlockIndices[0]) {
        return { type: "athlete" as const, athleteId: targetId };
      }
      return b;
    });
  }

  // Multi-atleta ou geral:
  // 1. Manter blocos de texto e blocos de atleta que estejam em cleanAthleteIds (sem duplicatas)
  const allowedSet = new Set(cleanAthleteIds);
  const seenAthletes = new Set<string>();
  const reconciled: EmailBlock[] = [];

  for (const block of sanitized) {
    if (block.type === "text") {
      reconciled.push(block);
    } else if (block.type === "athlete") {
      if (allowedSet.has(block.athleteId) && !seenAthletes.has(block.athleteId)) {
        seenAthletes.add(block.athleteId);
        reconciled.push(block);
      }
    }
  }

  // 2. Identificar quais atletas de cleanAthleteIds ainda faltam
  const missingAthleteIds = cleanAthleteIds.filter((id) => !seenAthletes.has(id));

  if (missingAthleteIds.length > 0) {
    const newAthleteBlocks: EmailBlock[] = missingAthleteIds.map((id) => ({
      type: "athlete",
      athleteId: id,
    }));

    const lastBlock = reconciled[reconciled.length - 1];
    if (lastBlock && lastBlock.type === "text" && reconciled.length > 1) {
      // Insere antes do último bloco de texto (fechamento)
      const insertIndex = reconciled.length - 1;
      reconciled.splice(insertIndex, 0, ...newAthleteBlocks);
    } else {
      reconciled.push(...newAthleteBlocks);
    }
  }

  return reconciled;
}

/**
 * Validação rigorosa de integridade (fail-closed) para preview e disparo do Mailer.
 * Lança erro explícito se o e-mail não puder garantir que os cards renderizados
 * correspondam exatamente aos atletas selecionados.
 */
export function assertEmailIntegrity(options: AssertEmailIntegrityOptions): void {
  const {
    mode,
    expectedAthleteIds = [],
    renderedAthleteIds = [],
    missingAthleteIds = [],
    html,
    text,
  } = options;

  if (!html || typeof html !== "string" || html.trim().length === 0) {
    throw new Error("Email integrity failure: Generated HTML is empty.");
  }
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Email integrity failure: Generated plain text is empty.");
  }

  if (mode === "catalog") {
    // No modo catálogo não deve haver cards de atletas
    return;
  }

  if (expectedAthleteIds.length === 0) {
    throw new Error(
      "Email integrity failure: Expected at least one athlete ID, but none provided.",
    );
  }

  if (missingAthleteIds.length > 0) {
    throw new Error(
      `Email integrity failure: Missing athlete data for [${missingAthleteIds.join(", ")}].`,
    );
  }

  const renderedSet = new Set(renderedAthleteIds);

  for (const expectedId of expectedAthleteIds) {
    if (!renderedSet.has(expectedId)) {
      throw new Error(
        `Email integrity failure: Selected athlete ${expectedId} was not rendered in the final output.`,
      );
    }
  }

  if (renderedAthleteIds.length !== expectedAthleteIds.length) {
    throw new Error(
      `Email integrity failure: Expected ${expectedAthleteIds.length} athletes rendered, got ${renderedAthleteIds.length}.`,
    );
  }

  // Verificação no HTML: deve conter os marcadores essenciais dos cards
  if (!html.includes("QUICK FACTS") || !html.includes("VIEW FULL PROFILE")) {
    throw new Error(
      "Email integrity failure: Generated HTML is missing mandatory athlete card markers (QUICK FACTS / VIEW FULL PROFILE).",
    );
  }

  // Verificação no Plain Text: deve conter o marcador de ação
  if (!text.includes("VIEW FULL PROFILE")) {
    throw new Error(
      "Email integrity failure: Generated plain text is missing mandatory athlete profile CTA.",
    );
  }
}
