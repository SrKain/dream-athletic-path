import { getPublicServerClient } from "./supabase/clients.server";

export const CANONICAL_BASE_URL = "https://portfolio.goteamgoagency.com";

/**
 * Gera o sitemap.xml dinâmico incluindo a página inicial e todas as atletas públicas ativas.
 */
export async function generateSitemapXml(): Promise<string> {
  let athleteEntries: Array<{ slug: string; lastmod: string }> = [];

  try {
    const client = getPublicServerClient();
    if (client) {
      const { data } = await client
        .from("athletes")
        .select("slug, created_at")
        .eq("is_public", true)
        .order("created_at", { ascending: false });

      if (data && Array.isArray(data)) {
        athleteEntries = data.map((item) => {
          let dateStr = new Date().toISOString().split("T")[0];
          if (item.created_at) {
            try {
              dateStr = new Date(item.created_at).toISOString().split("T")[0];
            } catch {
              // fallback para a data de hoje
            }
          }
          return {
            slug: item.slug,
            lastmod: dateStr,
          };
        });
      }
    }
  } catch (err) {
    console.error("[sitemap] Erro ao consultar atletas públicas:", err);
  }

  const today = new Date().toISOString().split("T")[0];

  const athleteUrls = athleteEntries
    .map(
      (entry) => `  <url>
    <loc>${CANONICAL_BASE_URL}/athlete/${encodeURIComponent(entry.slug)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${CANONICAL_BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${athleteUrls}
</urlset>`;
}
