import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function extractColumnsFromSql(migrationFiles: string[], tableName: string): Set<string> {
  const columns = new Set<string>();

  for (const filePath of migrationFiles) {
    const content = fs.readFileSync(filePath, "utf-8");

    // 1. CREATE TABLE public.<table_name> ( ... )
    const createTableRegex = new RegExp(
      `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${tableName}\\s*\\(([^;]+?)\\);`,
      "gis",
    );
    let match: RegExpExecArray | null;
    while ((match = createTableRegex.exec(content)) !== null) {
      const body = match[1];
      const lines = body.split("\n");
      for (const rawLine of lines) {
        const line = rawLine.trim().replace(/--.*$/, "").trim();
        if (
          !line ||
          line.startsWith("constraint") ||
          line.startsWith("primary key") ||
          line.startsWith("foreign key") ||
          line.startsWith("check") ||
          line.startsWith("unique")
        ) {
          continue;
        }
        const colMatch = line.match(/^([a-z0-9_]+)\s+/i);
        if (colMatch && colMatch[1]) {
          columns.add(colMatch[1].toLowerCase());
        }
      }
    }

    // 2. ALTER TABLE public.<table_name> ADD COLUMN (IF NOT EXISTS)? <col> ...
    // Note: Suporta múltiplas colunas separadas por vírgula no mesmo ALTER TABLE
    const alterTableRegex = new RegExp(
      `alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\.)?${tableName}\\s+([^;]+);`,
      "gis",
    );
    while ((match = alterTableRegex.exec(content)) !== null) {
      const alterBody = match[1];
      const addColumnRegex = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi;
      let colMatch: RegExpExecArray | null;
      while ((colMatch = addColumnRegex.exec(alterBody)) !== null) {
        if (colMatch[1]) {
          columns.add(colMatch[1].toLowerCase());
        }
      }

      // Suporta cláusula composta tipo: add column if not exists col1 type, add column if not exists col2 type
      // ou vírgula após add column
      const multiColRegex =
        /,\s*(?:add\s+column\s+)?(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+[a-z]/gi;
      let multiMatch: RegExpExecArray | null;
      while ((multiMatch = multiColRegex.exec(alterBody)) !== null) {
        if (
          multiMatch[1] &&
          !["constraint", "primary", "foreign", "check", "unique"].includes(
            multiMatch[1].toLowerCase(),
          )
        ) {
          columns.add(multiMatch[1].toLowerCase());
        }
      }
    }
  }

  return columns;
}

describe("Database Migration Schema Integrity vs. Application Code", () => {
  const migrationsDir = path.resolve(process.cwd(), "db/migrations");
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((f) => path.join(migrationsDir, f));

  it("verifies that email_events schema from migrations 0001–0023 covers every column written by resend-webhook.server.ts", () => {
    const emailEventsColumns = extractColumnsFromSql(migrationFiles, "email_events");

    // Colunas esperadas criadas nas migrations 0021, 0022 e 0023
    expect(emailEventsColumns.has("id")).toBe(true);
    expect(emailEventsColumns.has("provider_email_id")).toBe(true);
    expect(emailEventsColumns.has("event_type")).toBe(true);
    expect(emailEventsColumns.has("recipient")).toBe(true);
    expect(emailEventsColumns.has("occurred_at")).toBe(true);
    expect(emailEventsColumns.has("payload")).toBe(true);
    expect(emailEventsColumns.has("created_at")).toBe(true);
    // 0022
    expect(emailEventsColumns.has("campaign_id")).toBe(true);
    expect(emailEventsColumns.has("athlete_id")).toBe(true);
    expect(emailEventsColumns.has("clicked_url")).toBe(true);
    expect(emailEventsColumns.has("clicked_at")).toBe(true);
    expect(emailEventsColumns.has("user_agent")).toBe(true);
    expect(emailEventsColumns.has("is_probable_automated")).toBe(true);
    // 0023
    expect(emailEventsColumns.has("svix_id")).toBe(true);
    expect(emailEventsColumns.has("recipient_email")).toBe(true);
    expect(emailEventsColumns.has("subject")).toBe(true);
    expect(emailEventsColumns.has("tags")).toBe(true);

    // Ler código do webhook e extrair chaves de eventRow
    const webhookCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/email/resend-webhook.server.ts"),
      "utf-8",
    );

    const eventRowBlockMatch = webhookCode.match(
      /const\s+eventRow\s*:\s*Record<string,\s*unknown>\s*=\s*\{([\s\S]+?)\n\s*\};\s*const\s+upsertRes/,
    );
    expect(eventRowBlockMatch).toBeTruthy();
    const eventRowBody = eventRowBlockMatch![1];

    // Considera apenas as propriedades de nível superior de eventRow
    const lines = eventRowBody.split("\n");
    const rowKeys: string[] = [];
    let insideNestedObject = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.includes("{")) {
        const topKeyMatch = line.match(/^([a-z0-9_]+)\s*:\s*\{/i);
        if (topKeyMatch && !insideNestedObject) {
          rowKeys.push(topKeyMatch[1].toLowerCase());
          insideNestedObject = true;
          continue;
        }
      }
      if (line.includes("}")) {
        insideNestedObject = false;
        continue;
      }
      if (!insideNestedObject) {
        const keyMatch = line.match(/^([a-z0-9_]+)\s*:/i);
        if (keyMatch) {
          rowKeys.push(keyMatch[1].toLowerCase());
        }
      }
    }

    expect(rowKeys.length).toBeGreaterThan(5);

    // NENHUMA chave gravada pelo webhook pode estar ausente no schema de migrations
    for (const key of rowKeys) {
      const existsInSchema = emailEventsColumns.has(key);
      expect(
        existsInSchema,
        `resend-webhook.server.ts writes column '${key}' to email_events, but it does NOT exist in migrations!`,
      ).toBe(true);
    }

    // Confirma explicitamente que 'event_id' NÃO é gravado
    expect(rowKeys).not.toContain("event_id");
  });

  it("verifies that recruit_email_logs contains university_id, coach_role and provider_id for mailer integration", () => {
    const recruitEmailLogsColumns = extractColumnsFromSql(migrationFiles, "recruit_email_logs");

    expect(recruitEmailLogsColumns.has("id")).toBe(true);
    expect(recruitEmailLogsColumns.has("athlete_id")).toBe(true);
    expect(recruitEmailLogsColumns.has("coach_id")).toBe(true);
    expect(recruitEmailLogsColumns.has("recipient_email")).toBe(true);
    expect(recruitEmailLogsColumns.has("provider_id")).toBe(true);
    expect(recruitEmailLogsColumns.has("campaign_id")).toBe(true);
    expect(recruitEmailLogsColumns.has("university_name")).toBe(true);
    expect(recruitEmailLogsColumns.has("university_id")).toBe(true);
    expect(recruitEmailLogsColumns.has("coach_role")).toBe(true);
  });

  it("ensures migration 0023 defines a unique index on svix_id for upsert support", () => {
    const mig0023 = fs.readFileSync(
      path.resolve(process.cwd(), "db/migrations/0023_fix_email_events_schema_and_metrics_rpc.sql"),
      "utf-8",
    );

    expect(mig0023).toMatch(
      /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?[a-z0-9_]+\s+on\s+public\.email_events\s*\(\s*svix_id\s*\)/i,
    );
  });
});
