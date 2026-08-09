# Greed Island - Serverless Price Proxy (Cloudflare Worker)

This is the serverless price proxy for **Greed Island**. It is a single, stateless, zero-storage Cloudflare Worker that proxies stock and crypto price API requests to bypass browser CORS restrictions and normalize stock market symbols.

## Key Features

- **Stateless & Zero Storage**: Stores no logs, credentials, or cached request data.
- **US Equities**: Standard US tickers (e.g. `MSFT`, `AAPL`, `NVDA`).
- **Hong Kong Equities**: Normalizes HK numerical tickers to `.HK` format (e.g. `1810` -> `1810.HK`, `0700` -> `0700.HK`) and converts `HKD` prices to `USD` at live exchange rates.
- **Crypto**: Normalizes crypto symbols (e.g. `BTC` -> `BTC-USD`).
- **CORS Protection**: Restricted to allowed origins (GitHub Pages domain and local dev).

---

## Deployment Instructions

### Method 1: Deploy using Wrangler CLI (Recommended)

1. Open your terminal and navigate to the `cloudflare-worker` directory:
   ```bash
   cd cloudflare-worker
   ```
2. Login to your Cloudflare account:
   ```bash
   npx wrangler login
   ```
3. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```
4. Once deployed, Cloudflare will output your worker's live URL (e.g., `https://greed-island-price-proxy.<your-subdomain>.workers.dev`).

---

## Testing the Proxy

You can verify the proxy directly via `curl` or browser:

```bash
# Fetch US Stock Price (MSFT)
curl "https://greed-island-price-proxy.<your-subdomain>.workers.dev/price?ticker=MSFT&market=US"

# Fetch HK Stock Price (Xiaomi 1810)
curl "https://greed-island-price-proxy.<your-subdomain>.workers.dev/price?ticker=1810&market=HK"

# Fetch Crypto Price (Bitcoin)
curl "https://greed-island-price-proxy.<your-subdomain>.workers.dev/price?ticker=BTC&market=CRYPTO"
```

### Expected JSON Response Structure:

```json
{
  "ticker": "1810",
  "market": "HK",
  "symbol": "1810.HK",
  "price": 2.45,
  "currency": "USD",
  "rawPrice": 19.12,
  "rawCurrency": "HKD",
  "fetchedAt": "2026-08-08T22:25:00.000Z"
}
```

### Invalid Ticker Error Response (HTTP 404):

```json
{
  "error": "Ticker 'INVALID999' not found on market 'US' (Symbol searched: INVALID999)",
  "ticker": "INVALID999",
  "market": "US"
}
```
