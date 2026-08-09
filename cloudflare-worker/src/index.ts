/**
 * Greed Island - Serverless Price Proxy (Cloudflare Worker)
 * 
 * Stateless, zero-log Cloudflare Worker that proxies stock and crypto price calls.
 * Normalizes HK ticker suffixes (.HK) and handles HKD->USD currency conversion.
 */

export interface Env {
  // Allowed origins for CORS (e.g. "https://yourusername.github.io,http://localhost:3000")
  ALLOWED_ORIGINS?: string;
}

export interface PriceResponse {
  ticker: string;
  market: "US" | "HK" | "CRYPTO" | "OTHER";
  symbol: string;
  price: number;        // Always converted to USD, rounded to 2 decimals
  currency: "USD";
  rawPrice?: number;
  rawCurrency?: string;
  fetchedAt: string;
}

export interface ErrorResponse {
  error: string;
  ticker?: string;
  market?: string;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://github.io',
];

function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  const configuredOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim().toLowerCase())
    : [];

  let allowOrigin = '*'; // Default fallback for public Worker if no specific origin match
  
  if (origin) {
    const originLower = origin.toLowerCase();
    const isAllowed =
      configuredOrigins.some((allowed) => originLower === allowed || originLower.endsWith(allowed)) ||
      DEFAULT_ALLOWED_ORIGINS.some((allowed) => originLower === allowed || originLower.endsWith(allowed)) ||
      originLower.includes('github.io') ||
      originLower.includes('run.app');

    if (isAllowed) {
      allowOrigin = origin;
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };
}

/**
 * Normalizes ticker symbols based on market convention.
 * US: "MSFT" -> "MSFT"
 * HK: "1810" -> "1810.HK", "0700" -> "0700.HK"
 * CRYPTO: "BTC" -> "BTC-USD"
 */
function normalizeSymbol(ticker: string, market: string): { symbol: string; formattedTicker: string } {
  const cleanTicker = ticker.trim().toUpperCase();

  if (market === 'HK') {
    // If it's pure numbers, pad to 4 digits if needed (e.g. 700 -> 0700)
    let padded = cleanTicker;
    if (/^\d{1,4}$/.test(cleanTicker)) {
      padded = cleanTicker.padStart(4, '0');
    }
    const symbol = padded.endsWith('.HK') ? padded : `${padded}.HK`;
    return { symbol, formattedTicker: padded.replace('.HK', '') };
  }

  if (market === 'CRYPTO') {
    const symbol = cleanTicker.endsWith('-USD') ? cleanTicker : `${cleanTicker}-USD`;
    return { symbol, formattedTicker: cleanTicker.replace('-USD', '') };
  }

  return { symbol: cleanTicker, formattedTicker: cleanTicker };
}

/**
 * Fetches HKD to USD exchange rate from Yahoo Finance chart API
 */
async function getHkdToUsdRate(): Promise<number> {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/HKDUSD=X?interval=1d&range=1d';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof rate === 'number' && rate > 0) {
        return rate;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch HKDUSD exchange rate, using fallback 0.128', e);
  }
  return 0.128; // Fallback approximate rate (~7.8 HKD per USD)
}

/**
 * Main Worker Handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return new Response(
        JSON.stringify({ error: 'Method Not Allowed. Use GET /price' }),
        { status: 405, headers: corsHeaders }
      );
    }

    const url = new URL(request.url);

    // Endpoint route check
    if (url.pathname !== '/price' && url.pathname !== '/') {
      return new Response(
        JSON.stringify({ error: 'Not Found. Route must be GET /price' }),
        { status: 404, headers: corsHeaders }
      );
    }

    const rawTicker = url.searchParams.get('ticker');
    const rawMarket = (url.searchParams.get('market') || 'US').toUpperCase();

    if (!rawTicker) {
      return new Response(
        JSON.stringify({ error: "Missing required 'ticker' query parameter. Example: /price?ticker=MSFT&market=US" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const validMarkets = ['US', 'HK', 'CRYPTO', 'OTHER'];
    const market = (validMarkets.includes(rawMarket) ? rawMarket : 'US') as PriceResponse['market'];

    if (market === 'OTHER') {
      return new Response(
        JSON.stringify({ error: "Market 'OTHER' products do not support live automated price lookup." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { symbol, formattedTicker } = normalizeSymbol(rawTicker, market);

    try {
      // Primary upstream source: Yahoo Finance v8 Chart API
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      
      const upstreamRes = await fetch(yahooUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });

      if (!upstreamRes.ok) {
        if (upstreamRes.status === 404) {
          return new Response(
            JSON.stringify({
              error: `Ticker '${formattedTicker}' not found on market '${market}' (Symbol searched: ${symbol})`,
              ticker: formattedTicker,
              market,
            } as ErrorResponse),
            { status: 404, headers: corsHeaders }
          );
        }

        return new Response(
          JSON.stringify({
            error: `Upstream price service returned status ${upstreamRes.status}`,
            ticker: formattedTicker,
            market,
          } as ErrorResponse),
          { status: 502, headers: corsHeaders }
        );
      }

      const data = (await upstreamRes.json()) as any;
      const result = data?.chart?.result?.[0];
      const errorObj = data?.chart?.error;

      if (errorObj || !result) {
        return new Response(
          JSON.stringify({
            error: `Ticker '${formattedTicker}' not found or invalid upstream response.`,
            ticker: formattedTicker,
            market,
          } as ErrorResponse),
          { status: 404, headers: corsHeaders }
        );
      }

      const meta = result.meta;
      const rawPrice = meta?.regularMarketPrice ?? meta?.chartPreviousClose;
      const rawCurrency = (meta?.currency || (market === 'HK' ? 'HKD' : 'USD')).toUpperCase();

      if (typeof rawPrice !== 'number' || isNaN(rawPrice)) {
        return new Response(
          JSON.stringify({
            error: `Could not parse valid numerical price for '${formattedTicker}'`,
            ticker: formattedTicker,
            market,
          } as ErrorResponse),
          { status: 422, headers: corsHeaders }
        );
      }

      // Convert to USD if currency is HKD
      let usdPrice = rawPrice;
      if (rawCurrency === 'HKD') {
        const hkdRate = await getHkdToUsdRate();
        usdPrice = rawPrice * hkdRate;
      }

      // Round price to 2 decimal places in USD per Master Context
      const roundedUsdPrice = Math.round(usdPrice * 100) / 100;

      const responsePayload: PriceResponse = {
        ticker: formattedTicker,
        market,
        symbol,
        price: roundedUsdPrice,
        currency: 'USD',
        rawPrice: Math.round(rawPrice * 100) / 100,
        rawCurrency,
        fetchedAt: new Date().toISOString(),
      };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      return new Response(
        JSON.stringify({
          error: `Upstream price proxy request failed: ${errMessage}`,
          ticker: formattedTicker,
          market,
        } as ErrorResponse),
        { status: 502, headers: corsHeaders }
      );
    }
  },
};
