import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

/**
 * Normalizes ticker symbols
 */
function normalizeSymbol(ticker: string, market: string): { symbol: string; formattedTicker: string } {
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
 * Fetches HKD to USD exchange rate
 */
async function getHkdToUsdRate(): Promise<number> {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/HKDUSD=X?interval=1d&range=1d';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof rate === 'number' && rate > 0) {
        return rate;
      }
    }
  } catch (e) {
    console.warn('[server] HKDUSD rate fetch error, fallback 0.128', e);
  }
  return 0.128; // ~7.81 HKD per USD
}

// Server-side price proxy endpoint
app.get('/api/price', async (req, res) => {
  const rawTicker = (req.query.ticker as string) || '';
  const rawMarket = ((req.query.market as string) || 'US').toUpperCase();

  if (!rawTicker) {
    return res.status(400).json({ error: "Missing required 'ticker' query parameter." });
  }

  const validMarkets = ['US', 'HK', 'CRYPTO', 'OTHER'];
  const market = validMarkets.includes(rawMarket) ? rawMarket : 'US';

  if (market === 'OTHER') {
    return res.status(400).json({ error: "Market 'OTHER' products do not support live automated price lookup." });
  }

  const { symbol, formattedTicker } = normalizeSymbol(rawTicker, market);

  // Handle Crypto via CoinGecko directly
  if (market === 'CRYPTO') {
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
    };
    const coinId = COINGECKO_MAP[formattedTicker] || formattedTicker.toLowerCase();
    try {
      const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd`);
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        const price = cgData?.[coinId]?.usd;
        if (typeof price === 'number' && !isNaN(price)) {
          return res.json({
            ticker: formattedTicker,
            market: 'CRYPTO',
            symbol: `${formattedTicker}-USD`,
            price: Math.round(price * 100) / 100,
            currency: 'USD',
            rawPrice: price,
            rawCurrency: 'USD',
            fetchedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn('[server] CoinGecko fetch failed', err);
    }
  }

  // Handle US & HK Equities via Yahoo Finance v8 Chart API
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const upstreamRes = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (!upstreamRes.ok) {
      if (upstreamRes.status === 404) {
        return res.status(404).json({
          error: `Ticker '${formattedTicker}' not found on market '${market}' (Symbol searched: ${symbol})`,
          ticker: formattedTicker,
          market,
        });
      }
      return res.status(502).json({
        error: `Upstream price service returned HTTP ${upstreamRes.status}`,
        ticker: formattedTicker,
        market,
      });
    }

    const data = (await upstreamRes.json()) as any;
    const result = data?.chart?.result?.[0];
    const errorObj = data?.chart?.error;

    if (errorObj || !result) {
      return res.status(404).json({
        error: `Ticker '${formattedTicker}' not found or invalid response.`,
        ticker: formattedTicker,
        market,
      });
    }

    const meta = result.meta;
    const rawPrice = meta?.regularMarketPrice ?? meta?.chartPreviousClose;
    const rawCurrency = (meta?.currency || (market === 'HK' ? 'HKD' : 'USD')).toUpperCase();

    if (typeof rawPrice !== 'number' || isNaN(rawPrice)) {
      return res.status(422).json({
        error: `Could not parse numerical price for '${formattedTicker}'`,
        ticker: formattedTicker,
        market,
      });
    }

    let usdPrice = rawPrice;
    if (rawCurrency === 'HKD') {
      const hkdRate = await getHkdToUsdRate();
      usdPrice = rawPrice * hkdRate;
    }

    const roundedUsdPrice = Math.round(usdPrice * 100) / 100;

    return res.json({
      ticker: formattedTicker,
      market,
      symbol,
      price: roundedUsdPrice,
      currency: 'USD',
      rawPrice: Math.round(rawPrice * 100) / 100,
      rawCurrency,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({
      error: `Server price request failed: ${msg}`,
      ticker: formattedTicker,
      market,
    });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Greed Island server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
