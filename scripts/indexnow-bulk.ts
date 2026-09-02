import { submitToIndexNow } from "../src/lib/indexnow";
import { CANONICAL_BASE_URL, generateSitemapXml } from "../src/lib/sitemap";

/**
 * Script de submissão em massa (bulk) do sitemap dinâmico para o protocolo IndexNow.
 * Executável via: bun scripts/indexnow-bulk.ts
 */
async function runIndexNowBulk() {
  console.log("🚀 [IndexNow Bulk] Iniciando sincronização em massa...");

  let xmlContent = "";

  // 1. Tenta obter o sitemap.xml do site de produção
  const sitemapUrl = `${CANONICAL_BASE_URL}/sitemap.xml`;
  try {
    console.log(`📡 [IndexNow Bulk] Buscando sitemap de produção em: ${sitemapUrl}`);
    const response = await fetch(sitemapUrl, {
      headers: {
        "User-Agent": "IndexNow-Bulk-Script/1.0",
      },
    });

    if (response.ok) {
      xmlContent = await response.text();
      console.log("✅ [IndexNow Bulk] Sitemap obtido com sucesso via HTTP.");
    } else {
      console.warn(
        `⚠️ [IndexNow Bulk] HTTP ${response.status} ao buscar sitemap público. Usando gerador local...`,
      );
    }
  } catch (err) {
    console.warn(
      `⚠️ [IndexNow Bulk] Falha na requisição HTTP (${err instanceof Error ? err.message : String(err)}). Usando gerador local...`,
    );
  }

  // 2. Fallback para gerador interno se o fetch falhar
  if (!xmlContent || !xmlContent.includes("<loc>")) {
    try {
      console.log("⚙️ [IndexNow Bulk] Gerando sitemap diretamente pelo banco de dados...");
      xmlContent = await generateSitemapXml();
    } catch (err) {
      console.error(
        "❌ [IndexNow Bulk] Erro ao gerar sitemap localmente:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 3. Extrai todas as URLs contidas nas tags <loc>
  const locRegex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = locRegex.exec(xmlContent)) !== null) {
    if (match[1]) {
      urls.push(match[1]);
    }
  }

  // Garante ao menos a home se nenhuma URL for encontrada
  if (urls.length === 0) {
    console.warn(
      "⚠️ [IndexNow Bulk] Nenhuma URL encontrada no sitemap. Adicionando home padrão...",
    );
    urls.push(`${CANONICAL_BASE_URL}/`);
  }

  console.log(`📋 [IndexNow Bulk] Total de URLs públicas identificadas: ${urls.length}`);
  urls.forEach((url, idx) => console.log(`   ${idx + 1}. ${url}`));

  // 4. Submete para o IndexNow
  console.log("\n📤 [IndexNow Bulk] Enviando lote para https://api.indexnow.org/indexnow...");
  const success = await submitToIndexNow(urls);

  if (success) {
    console.log(
      `\n🎉 [IndexNow Bulk] SUCESSO! ${urls.length} URL(s) notificadas ao Bing / IndexNow.`,
    );
  } else {
    console.error(
      "\n❌ [IndexNow Bulk] A submissão retornou erro ou status não-200. Verifique os logs acima.",
    );
  }
}

void runIndexNowBulk();
