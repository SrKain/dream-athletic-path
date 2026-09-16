import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { generateSitemapXml } from "./lib/sitemap";
import { processSnsWebhook } from "./lib/email/ses-webhook.server";
import { processScheduledEmails } from "./lib/email/email.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Injects CDN/Edge and browser Cache-Control headers to dramatically reduce Supabase egress.
 * Public routes (catalog `/`, athlete profiles `/athlete/:slug`, and public server functions)
 * are cached on Vercel Edge / CDN with stale-while-revalidate.
 * Admin and authenticated requests are strictly protected with no-store.
 */
function applyCacheControlHeaders(request: Request, response: Response): Response {
  // Never cache error responses, non-GET/HEAD methods, or responses that already set private/no-store
  if (response.status !== 200 || (request.method !== "GET" && request.method !== "HEAD")) {
    return response;
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // Protect private/authenticated routes
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/auth") ||
    request.headers.get("authorization") ||
    request.headers.get("cookie")?.includes("sb-")
  ) {
    const headers = new Headers(response.headers);
    headers.set("cache-control", "private, no-cache, no-store, must-revalidate");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  let cacheControl = "";
  if (pathname === "/" || pathname === "") {
    // Public Catalog: 60s in browser, 5min in Edge CDN, up to 24h stale-while-revalidate
    cacheControl = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";
  } else if (pathname.startsWith("/athlete/")) {
    // Athlete Profile: 2min in browser, 15min in Edge CDN, up to 24h stale-while-revalidate
    cacheControl = "public, max-age=120, s-maxage=900, stale-while-revalidate=86400";
  } else if (pathname.includes("listPublicAthletes") || pathname.includes("getPublicAthlete")) {
    // Public Server Function calls
    cacheControl = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";
  }

  const existingCacheControl = response.headers.get("cache-control") ?? "";
  if (
    cacheControl &&
    !existingCacheControl.includes("no-store") &&
    !existingCacheControl.includes("private")
  ) {
    const headers = new Headers(response.headers);
    headers.set("cache-control", cacheControl);
    headers.set("cdn-cache-control", cacheControl);
    headers.set("vercel-cdn-cache-control", cacheControl);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/sitemap.xml") {
        const xml = await generateSitemapXml();
        return new Response(xml, {
          status: 200,
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600, s-maxage=3600",
          },
        });
      }

      if (url.pathname === "/api/webhooks/ses" && request.method === "POST") {
        const rawBody = await request.text();
        const result = await processSnsWebhook(rawBody);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      if (
        url.pathname === "/api/cron/process-scheduled-emails" &&
        (request.method === "POST" || request.method === "GET")
      ) {
        const result = await processScheduledEmails();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return applyCacheControlHeaders(request, normalized);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
