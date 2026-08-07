/**
 * tidal-net.ts
 *
 * Shared Tidal networking helpers.
 *
 * Luna proxies Tidal API calls through Monochrome's Cloudflare Worker
 * (tidal-proxy.monochrome.tf) to avoid rate limiting / IP blocks. When the
 * proxy is unreachable or returns a Cloudflare/server error, we transparently
 * fall back to the direct Tidal API (auth.tidal.com / api.tidal.com).
 */

const TIDAL_PROXY_HOST = 'tidal-proxy.monochrome.tf';

export function wrapTidalUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  // Match the web app's proxy-utils.js: replace with the bare host so the
  // original scheme (https://) is preserved rather than doubled.
  return url
    .replace('openapi.tidal.com', `${TIDAL_PROXY_HOST}/openapi`)
    .replace('api.tidal.com', `${TIDAL_PROXY_HOST}/api`);
}

export function unproxyTidalUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  return url
    .replace(`${TIDAL_PROXY_HOST}/openapi`, 'openapi.tidal.com')
    .replace(`${TIDAL_PROXY_HOST}/api`, 'api.tidal.com');
}

/**
 * Fetch a Tidal endpoint with automatic proxy → direct fallback.
 *
 * Tries the proxied URL first. Falls back to the direct Tidal URL when the
 * proxy is down (network error) or returns a Cloudflare / 5xx response.
 * 401/404/etc. are returned as-is so callers can handle them (e.g. token retry).
 */
export async function fetchTidalWithFallback(
  url: string,
  init?: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const proxiedUrl = wrapTidalUrl(url);
  const directUrl = unproxyTidalUrl(proxiedUrl);
  const useDirect = directUrl !== proxiedUrl;

  const attempt = async (target: string): Promise<Response | null> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(target, { ...init, signal: controller.signal });
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const proxiedResponse = await attempt(proxiedUrl);

  if (proxiedResponse) {
    const status = proxiedResponse.status;
    // Proxy-specific failures only: Cloudflare block (403) or upstream 5xx.
    const shouldFallback = status === 403 || status >= 500;
    if (!shouldFallback) return proxiedResponse;
  }

  if (useDirect) {
    console.warn(
      `[Tidal] Proxy failed (${proxiedResponse?.status ?? 'network error'}), falling back to direct: ${directUrl}`,
    );
    const directResponse = await attempt(directUrl);
    if (directResponse) return directResponse;
  }

  if (proxiedResponse) return proxiedResponse;
  throw new Error(`Tidal request failed via proxy and direct: ${url}`);
}
