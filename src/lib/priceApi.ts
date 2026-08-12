import { Market, PriceCacheEntry } from '../types';
import { storage } from './storage';

export interface PriceFetchResult {
  success: boolean;
  ticker: string;
  market: Market;
  symbol: string;
  price?: number;        // Always USD, rounded to 2 decimals
  currency?: 'USD';
  rawPrice?: number;
  rawCurrency?: string;
  fetchedAt?: string;
  error?: string;
  status?: number;
}

const CUSTOM_WORKER_URL_KEY = 'greedisland:customWorkerUrl';

// CoinGecko ID mappings
const COINGECKO_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  BNB: 'binancecoin',
  ADA: 'cardano',
  SUI: 'sui',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  DOT: 'polkadot',
  NEAR: 'near',
  POL: 'polygon-ecosystem-token',
  MATIC: 'polygon-ecosystem-token',
};

// In-memory FX rate cache (valid for 1 hour)
let cachedUsdHkdRate: { rate: number; fetchedAt: number } | null = null;

export function getCustomWorkerUrl(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem(CUSTOM_WORKER_URL_KEY) || '';
  }
  return '';
}

export function setCustomWorkerUrl(url: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (!url.trim()) {
      localStorage.removeItem(CUSTOM_WORKER_URL_KEY);
    } else {
      localStorage.setItem(CUSTOM_WORKER_URL_KEY, url.trim());
    }
  }
}

/**
 * Normalizes ticker symbols client-side
 */
export function normalizeSymbolClient(ticker: string, market: Market): { symbol: string; formattedTicker: string } {
  const cleanTicker = ticker.trim().toUpperCase();

  if (market === 'HK') {
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
 * Helper to execute fetch calls with a strict timeout (default 7 seconds)
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 7000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Session throttling for auto-refresh on app load (5 minute cooldown)
 */
let lastAutoRefreshTime = 0;
const AUTO_REFRESH_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

export function shouldAutoRefresh(): boolean {
  return Date.now() - lastAutoRefreshTime > AUTO_REFRESH_THROTTLE_MS;
}

export function recordAutoRefreshTime(): void {
  lastAutoRefreshTime = Date.now();
}

/**
 * Module 3: getUsdHkdRate()
 * Calls a free public FX API directly. Used internally to convert HKD to USD.
 * The app never displays HKD — conversion happens invisibly inside this module.
 */
export async function getUsdHkdRate(): Promise<number> {
  const ONE_HOUR_MS = 3600 * 1000;
  if (cachedUsdHkdRate && Date.now() - cachedUsdHkdRate.fetchedAt < ONE_HOUR_MS) {
    return cachedUsdHkdRate.rate;
  }

  // 1. Try open.er-api.com
  try {
    const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', {}, 4000);
    if (res.ok) {
      const data = await res.json();
      const hkdRate = data?.rates?.HKD;
      if (typeof hkdRate === 'number' && hkdRate > 0) {
        cachedUsdHkdRate = { rate: hkdRate, fetchedAt: Date.now() };
        return hkdRate;
      }
    }
  } catch (err) {
    console.warn('[priceApi] Open ER API failed, trying exchangerate-api fallback', err);
  }

  // 2. Fallback to exchangerate-api
  try {
    const res = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/USD', {}, 4000);
    if (res.ok) {
      const data = await res.json();
      const hkdRate = data?.rates?.HKD;
      if (typeof hkdRate === 'number' && hkdRate > 0) {
        cachedUsdHkdRate = { rate: hkdRate, fetchedAt: Date.now() };
        return hkdRate;
      }
    }
  } catch (err) {
    console.warn('[priceApi] Exchangerate-api fallback failed', err);
  }

  // 3. Fallback default ~7.81 HKD per USD (approx ~0.128 USD per HKD)
  const fallback = 7.81;
  cachedUsdHkdRate = { rate: fallback, fetchedAt: Date.now() };
  return fallback;
}

/**
 * Converts HKD amount to USD using live FX rate
 */
export async function convertHkdToUsd(hkdAmount: number): Promise<number> {
  const usdHkdRate = await getUsdHkdRate(); // HKD per 1 USD
  const usdVal = hkdAmount / usdHkdRate;
  return Math.round(usdVal * 100) / 100;
}

/**
 * Direct fallback fetcher using local Express server route or public fallback.
 */
async function fetchDirectFallback(ticker: string, market: Market): Promise<PriceFetchResult> {
  const { symbol, formattedTicker } = normalizeSymbolClient(ticker, market);

  // 1. First try local server route /api/price (only when running on Node/Express server, not static GitHub Pages)
  const isStaticHost = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
  if (!isStaticHost) {
    try {
      const localApiUrl = `/api/price?ticker=${encodeURIComponent(formattedTicker)}&market=${market}`;
      const res = await fetchWithTimeout(localApiUrl, {}, 3000);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const json = await res.json();
        if (typeof json.price === 'number') {
          return {
            success: true,
            ticker: json.ticker || formattedTicker,
            market: json.market || market,
            symbol: json.symbol || symbol,
            price: json.price,
            currency: 'USD',
            rawPrice: json.rawPrice,
            rawCurrency: json.rawCurrency,
            fetchedAt: json.fetchedAt || new Date().toISOString(),
            status: 200,
          };
        }
      }
    } catch (e) {
      // Local /api/price not available or static environment
    }
  }

  // 2. Secondary fallbacks for static environments (e.g. GitHub Pages) without custom worker
  const yahooUrl2 = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const yahooUrl1 = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  
  const urlsToTry = [
    { url: yahooUrl2, isWrapped: false },
    { url: yahooUrl1, isWrapped: false },
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl2)}`, isWrapped: true },
    { url: `https://proxy.cors.sh/${yahooUrl2}`, isWrapped: false },
    { url: `https://corsproxy.io/?${encodeURIComponent(yahooUrl2)}`, isWrapped: false },
  ];

  let lastError = '';
  let lastStatus = 500;

  for (const { url, isWrapped } of urlsToTry) {
    try {
      const res = await fetchWithTimeout(url, {}, 5000);
      if (!res.ok) {
        lastStatus = res.status;
        if (res.status === 404) {
          return {
            success: false,
            ticker: formattedTicker,
            market,
            symbol,
            error: `Ticker '${formattedTicker}' not found on market '${market}' (Symbol searched: ${symbol})`,
            status: 404,
          };
        }
        lastError = `Upstream price service returned status ${res.status}`;
        continue;
      }

      let data = await res.json();
      if (isWrapped && data && typeof data.contents === 'string') {
        try {
          data = JSON.parse(data.contents);
        } catch (e) {
          lastError = 'Failed to parse wrapped JSON from proxy';
          continue;
        }
      }

      const result = data?.chart?.result?.[0];
      if (!result) {
        continue;
      }

      const meta = result.meta;
      const rawPrice = meta?.regularMarketPrice ?? meta?.chartPreviousClose;
      const rawCurrency = (meta?.currency || (market === 'HK' ? 'HKD' : 'USD')).toUpperCase();

      if (typeof rawPrice !== 'number' || isNaN(rawPrice)) {
        return {
          success: false,
          ticker: formattedTicker,
          market,
          symbol,
          error: `Could not parse valid numerical price for '${formattedTicker}'`,
          status: 422,
        };
      }

      let usdPrice = rawPrice;
      if (rawCurrency === 'HKD') {
        usdPrice = await convertHkdToUsd(rawPrice);
      }

      const price = Math.round(usdPrice * 100) / 100;
      const fetchedAt = new Date().toISOString();

      return {
        success: true,
        ticker: formattedTicker,
        market,
        symbol,
        price,
        currency: 'USD',
        rawPrice: Math.round(rawPrice * 100) / 100,
        rawCurrency,
        fetchedAt,
        status: 200,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    success: false,
    ticker: formattedTicker,
    market,
    symbol,
    error: `Direct fetch failed (${lastError}). Deploy and enter your Cloudflare Worker URL in Settings for guaranteed price updates.`,
    status: lastStatus,
  };
}

/**
 * Module 3: getStockPrice(ticker, market)
 * Calls Cloudflare Worker proxy from Module 2 (or fallback).
 * Handles success/failure cache updates and fail state propagation.
 */
export async function getStockPrice(
  ticker: string,
  market: 'US' | 'HK',
  overrideWorkerUrl?: string
): Promise<PriceFetchResult> {
  const { formattedTicker } = normalizeSymbolClient(ticker, market);
  const workerBase = overrideWorkerUrl !== undefined ? overrideWorkerUrl : getCustomWorkerUrl();
  const cacheKey = `${market}:${formattedTicker}`;
  const now = new Date().toISOString();

  let fetchResult: PriceFetchResult | null = null;

  if (workerBase && workerBase.trim()) {
    try {
      const cleanBase = workerBase.trim().replace(/\/+$/, '');
      const fetchUrl = `${cleanBase}/price?ticker=${encodeURIComponent(formattedTicker)}&market=${market}`;

      const res = await fetchWithTimeout(fetchUrl, {}, 7000);
      const json = await res.json();

      if (res.ok && typeof json.price === 'number') {
        fetchResult = {
          success: true,
          ticker: json.ticker || formattedTicker,
          market: json.market || market,
          symbol: json.symbol || formattedTicker,
          price: json.price,
          currency: 'USD',
          rawPrice: json.rawPrice,
          rawCurrency: json.rawCurrency,
          fetchedAt: json.fetchedAt || now,
          status: res.status,
        };
      } else {
        fetchResult = {
          success: false,
          ticker: formattedTicker,
          market,
          symbol: json.symbol || formattedTicker,
          error: json.error || `Worker proxy returned error status ${res.status}`,
          status: res.status,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[priceApi] Custom worker fetch error (${msg}), using direct fallback`);
      fetchResult = await fetchDirectFallback(formattedTicker, market);
    }
  } else {
    fetchResult = await fetchDirectFallback(formattedTicker, market);
  }

  // Cache & Fallback Logic according to Module 3 Rule 4
  const existingCache = storage.getPriceCache()[cacheKey];

  if (fetchResult.success && typeof fetchResult.price === 'number') {
    const cacheEntry: PriceCacheEntry = {
      ticker: formattedTicker,
      market,
      price: fetchResult.price,
      lastFetchedAt: fetchResult.fetchedAt || now,
      lastFetchStatus: 'success',
    };
    storage.setPriceCacheEntry(cacheKey, cacheEntry);
    return fetchResult;
  } else {
    // Failure case
    if (existingCache) {
      // Mark as fail, but return cached price so UI can show stale price with red status indicator
      storage.setPriceCacheEntry(cacheKey, {
        ...existingCache,
        lastFetchedAt: now,
        lastFetchStatus: 'fail',
      });

      return {
        success: false,
        ticker: formattedTicker,
        market,
        symbol: fetchResult.symbol || formattedTicker,
        price: existingCache.price, // Fallback to last cached price
        currency: 'USD',
        fetchedAt: existingCache.lastFetchedAt,
        error: fetchResult.error || 'Fetch failed, using cached price',
        status: fetchResult.status || 500,
      };
    } else {
      // No cached price exists at all -> return clear "no price available" state (price: undefined)
      return {
        success: false,
        ticker: formattedTicker,
        market,
        symbol: fetchResult.symbol || formattedTicker,
        price: undefined,
        error: fetchResult.error || 'Fetch failed and no cached price is available',
        status: fetchResult.status || 500,
      };
    }
  }
}

/**
 * Module 3: getCryptoPrice(symbol)
 * Calls CoinGecko's public API directly (no proxy needed).
 * Supports BTC, ETH, SOL, XRP, BNB, ADA, SUI at minimum.
 */
export async function getCryptoPrice(symbolInput: string): Promise<PriceFetchResult> {
  const cleanTicker = symbolInput.trim().toUpperCase().replace(/-USD$/, '');
  const coinGeckoId = COINGECKO_MAP[cleanTicker] || cleanTicker.toLowerCase();
  const cacheKey = `CRYPTO:${cleanTicker}`;
  const now = new Date().toISOString();

  let fetchResult: PriceFetchResult | null = null;

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinGeckoId)}&vs_currencies=usd`;
    const res = await fetchWithTimeout(url, {}, 7000);

    if (res.ok) {
      const data = await res.json();
      const rawPrice = data?.[coinGeckoId]?.usd;

      if (typeof rawPrice === 'number' && !isNaN(rawPrice)) {
        const roundedPrice = Math.round(rawPrice * 100) / 100;
        fetchResult = {
          success: true,
          ticker: cleanTicker,
          market: 'CRYPTO',
          symbol: `${cleanTicker}-USD`,
          price: roundedPrice,
          currency: 'USD',
          rawPrice,
          rawCurrency: 'USD',
          fetchedAt: now,
          status: 200,
        };
      } else {
        fetchResult = {
          success: false,
          ticker: cleanTicker,
          market: 'CRYPTO',
          symbol: `${cleanTicker}-USD`,
          error: `Crypto symbol '${cleanTicker}' (CoinGecko ID: '${coinGeckoId}') not found or invalid response.`,
          status: 404,
        };
      }
    } else {
      fetchResult = {
        success: false,
        ticker: cleanTicker,
        market: 'CRYPTO',
        symbol: `${cleanTicker}-USD`,
        error: `CoinGecko API returned status ${res.status}`,
        status: res.status,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fetchResult = {
      success: false,
      ticker: cleanTicker,
      market: 'CRYPTO',
      symbol: `${cleanTicker}-USD`,
      error: `CoinGecko network request error: ${msg}`,
      status: 500,
    };
  }

  // Cache & Fallback Logic
  const existingCache = storage.getPriceCache()[cacheKey];

  if (fetchResult.success && typeof fetchResult.price === 'number') {
    const cacheEntry: PriceCacheEntry = {
      ticker: cleanTicker,
      market: 'CRYPTO',
      price: fetchResult.price,
      lastFetchedAt: now,
      lastFetchStatus: 'success',
    };
    storage.setPriceCacheEntry(cacheKey, cacheEntry);
    return fetchResult;
  } else {
    if (existingCache) {
      storage.setPriceCacheEntry(cacheKey, {
        ...existingCache,
        lastFetchedAt: now,
        lastFetchStatus: 'fail',
      });
      return {
        success: false,
        ticker: cleanTicker,
        market: 'CRYPTO',
        symbol: `${cleanTicker}-USD`,
        price: existingCache.price,
        currency: 'USD',
        fetchedAt: existingCache.lastFetchedAt,
        error: fetchResult.error || 'CoinGecko fetch failed, using cached price',
        status: fetchResult.status || 500,
      };
    } else {
      return {
        success: false,
        ticker: cleanTicker,
        market: 'CRYPTO',
        symbol: `${cleanTicker}-USD`,
        price: undefined,
        error: fetchResult.error || 'CoinGecko fetch failed and no cached price is available',
        status: fetchResult.status || 500,
      };
    }
  }
}

/**
 * Module 3: refreshPrice(ticker, market)
 * Re-runs the price fetch for one ticker and updates cache + status.
 */
export async function refreshPrice(ticker: string, market: Market = 'US'): Promise<PriceFetchResult> {
  if (market === 'CRYPTO') {
    return getCryptoPrice(ticker);
  }
  if (market === 'US' || market === 'HK') {
    return getStockPrice(ticker, market);
  }
  return {
    success: false,
    ticker,
    market,
    symbol: ticker,
    error: "Market 'OTHER' products do not support live automated price lookup.",
    status: 400,
  };
}

/**
 * Backward compatibility alias for fetchStockPrice used in components
 */
export async function fetchStockPrice(
  ticker: string,
  market: Market,
  overrideWorkerUrl?: string
): Promise<PriceFetchResult> {
  if (market === 'CRYPTO') {
    return getCryptoPrice(ticker);
  }
  if (market === 'US' || market === 'HK') {
    return getStockPrice(ticker, market, overrideWorkerUrl);
  }
  return refreshPrice(ticker, market);
}

/**
 * Module 3: Reasonable request batching/throttling
 * Sequences or chunks requests (max 4 concurrency, 100ms delay between chunks)
 * Uses Promise.allSettled so individual failures never block or crash the batch.
 */
export async function batchFetchPrices(
  items: Array<{ ticker: string; market: Market }>,
  concurrency: number = 4,
  delayMsBetweenBatches: number = 100,
  onProgress?: (completed: number, total: number) => void
): Promise<PriceFetchResult[]> {
  const results: PriceFetchResult[] = [];
  let completed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);

    const chunkPromises = chunk.map(async (item) => {
      try {
        const res = await refreshPrice(item.ticker, item.market);
        return res;
      } catch (err) {
        const cacheKey = `${item.market}:${item.ticker}`;
        const existingCache = storage.getPriceCache()[cacheKey];
        return {
          success: false,
          ticker: item.ticker,
          market: item.market,
          symbol: item.ticker,
          price: existingCache?.price,
          error: err instanceof Error ? err.message : 'Unknown refresh error',
          status: 500,
        };
      } finally {
        completed++;
        if (onProgress) {
          onProgress(completed, items.length);
        }
      }
    });

    const chunkSettled = await Promise.allSettled(chunkPromises);
    for (const res of chunkSettled) {
      if (res.status === 'fulfilled') {
        results.push(res.value);
      }
    }

    if (i + concurrency < items.length && delayMsBetweenBatches > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMsBetweenBatches));
    }
  }

  return results;
}
