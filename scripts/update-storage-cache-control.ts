import { createClient } from "@supabase/supabase-js";

/**
 * Script: update-storage-cache-control.ts
 *
 * Traverses public buckets ('athlete-media', 'proposal-assets', 'stage-celebrations')
 * and re-applies `Cache-Control: public, max-age=31536000, immutable` to existing objects.
 *
 * Usage:
 *   npx tsx scripts/update-storage-cache-control.ts
 *
 * Env:
 *   SUPABASE_URL (or VITE_SUPABASE_URL)
 *   SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 */

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY/SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const BUCKETS = ["athlete-media", "proposal-assets", "stage-celebrations"];
const TARGET_CACHE_CONTROL = "31536000"; // 1 year in seconds

async function listAllFiles(bucket: string, prefix = ""): Promise<string[]> {
  const filePaths: string[] = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 100,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    console.warn(
      `[WARN] Error listing in bucket "${bucket}" at prefix "${prefix}":`,
      error.message,
    );
    return filePaths;
  }

  if (!data) return filePaths;

  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    // In Supabase Storage, folder items have id === null
    if (item.id === null) {
      const nested = await listAllFiles(bucket, fullPath);
      filePaths.push(...nested);
    } else {
      filePaths.push(fullPath);
    }
  }

  return filePaths;
}

async function updateFileCache(bucket: string, filePath: string): Promise<boolean> {
  try {
    // Download existing object
    const { data: blob, error: dlError } = await supabase.storage.from(bucket).download(filePath);
    if (dlError || !blob) {
      console.warn(`  ↳ Failed to download ${filePath}:`, dlError?.message);
      return false;
    }

    const contentType = blob.type || "application/octet-stream";

    // Re-upload with cacheControl header and upsert: true
    const { error: upError } = await supabase.storage.from(bucket).upload(filePath, blob, {
      upsert: true,
      contentType,
      cacheControl: TARGET_CACHE_CONTROL,
    });

    if (upError) {
      console.warn(`  ↳ Failed to update cache for ${filePath}:`, upError.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`  ↳ Unexpected error on ${filePath}:`, err);
    return false;
  }
}

async function main() {
  console.log("=== Storage Cache-Control Migration ===");
  console.log(`Target Supabase URL: ${supabaseUrl}`);
  console.log(`Cache-Control: public, max-age=${TARGET_CACHE_CONTROL}, immutable\n`);

  let totalUpdated = 0;
  let totalFailed = 0;

  for (const bucket of BUCKETS) {
    console.log(`Scanning bucket: "${bucket}"...`);
    const files = await listAllFiles(bucket);
    console.log(`Found ${files.length} object(s) in "${bucket}".`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      process.stdout.write(`[${i + 1}/${files.length}] Updating ${file}... `);
      const ok = await updateFileCache(bucket, file);
      if (ok) {
        process.stdout.write("OK\n");
        totalUpdated++;
      } else {
        process.stdout.write("FAILED\n");
        totalFailed++;
      }
    }
  }

  console.log("\n=== Migration Complete ===");
  console.log(`Successfully updated: ${totalUpdated}`);
  console.log(`Failed / Skipped:     ${totalFailed}`);
}

main().catch((err) => {
  console.error("Fatal error during storage update:", err);
  process.exit(1);
});
