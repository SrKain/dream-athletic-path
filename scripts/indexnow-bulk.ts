/**
 * Script de submissão em massa (bulk) do sitemap dinâmico para o protocolo IndexNow.
 * Totalmente autocontido e standalone — executável diretamente via:
 *   npx tsx scripts/indexnow-bulk.ts
 */

const INDEXNOW_KEY = "1675dcaaacd2469b9461671a29b307e0";
const HOST = "portfolio.goteamgoagency.com";
const KEY_LOCATION = `https://${HOST}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/**
 * Submete lote de URLs diretamente à API do IndexNow sem depender do runtime do TanStack Start.
 */
async function submitUrlsToIndexNow(
  urlList: string[],
): Promise<{ ok: boolean; status: number; text: string }> {
  const payload: IndexNowPayload = {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: KEY_LOCATION,
    urlList,
  };

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "IndexNow-Bulk-Standalone/1.0",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text: responseText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 0,
      text: message,
    };
  }
}

/**
 * Executa o fluxo de leitura do sitemap e submissão em massa.
 */
async function runIndexNowBulk() {
  console.log("🚀 [IndexNow Bulk] Iniciando sincronização em massa standalone...");
  console.log(`🌐 Host: ${HOST}`);
  console.log(`🔑 Key: ${INDEXNOW_KEY}`);
  console.log(`📍 Key Location: ${KEY_LOCATION}`);

  const sitemapUrl = `https://${HOST}/sitemap.xml`;
  let xmlContent = "";

  try {
    console.log(`\n📡 [IndexNow Bulk] Buscando sitemap público em: ${sitemapUrl}`);
    const response = await fetch(sitemapUrl, {
      headers: {
        "User-Agent": "IndexNow-Bulk-Standalone/1.0",
      },
    });

    if (response.ok) {
      xmlContent = await response.text();
      console.log(`✅ [IndexNow Bulk] Sitemap obtido com sucesso (HTTP ${response.status}).`);
    } else {
      console.warn(`⚠️ [IndexNow Bulk] HTTP ${response.status} ao buscar ${sitemapUrl}.`);
    }
  } catch (err) {
    console.warn(
      `⚠️ [IndexNow Bulk] Falha na requisição ao sitemap: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Extrai todas as URLs de tags <loc>
  const locRegex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  if (xmlContent) {
    while ((match = locRegex.exec(xmlContent)) !== null) {
      if (match[1]) {
        urls.push(match[1]);
      }
    }
  }

  // Fallback para a URL raiz caso nenhuma tenha sido extraída
  if (urls.length === 0) {
    console.warn(
      "⚠️ [IndexNow Bulk] Nenhuma URL encontrada via sitemap.xml. Utilizando URL base como fallback...",
    );
    urls.push(`https://${HOST}/`);
  }

  // Deduplicação de URLs
  const uniqueUrls = Array.from(new Set(urls));

  console.log(`\n📋 [IndexNow Bulk] Quantidade de URLs a enviar: ${uniqueUrls.length}`);
  uniqueUrls.forEach((url, idx) => console.log(`   ${idx + 1}. ${url}`));

  // Envio em lote para a API do IndexNow
  console.log(`\n📤 [IndexNow Bulk] Enviando lote para ${INDEXNOW_ENDPOINT}...`);
  const result = await submitUrlsToIndexNow(uniqueUrls);

  console.log(`\n📊 [IndexNow Bulk] Resposta da API do IndexNow:`);
  console.log(`   Status HTTP: ${result.status}`);
  if (result.text) {
    console.log(`   Mensagem/Corpo: ${result.text}`);
  }

  if (result.ok || result.status === 200 || result.status === 202) {
    console.log(
      `\n🎉 [IndexNow Bulk] SUCESSO! ${uniqueUrls.length} URL(s) notificadas com êxito (HTTP ${result.status}).`,
    );
  } else {
    console.error(
      `\n❌ [IndexNow Bulk] Submissão finalizada com status ${result.status}. Verifique se a chave está publicada em ${KEY_LOCATION}.`,
    );
  }
}

void runIndexNowBulk();
