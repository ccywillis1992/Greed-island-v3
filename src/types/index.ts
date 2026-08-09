export type Broker = "FUTU" | "IBKR" | "HSBC" | "Binance";
export type Market = "US" | "HK" | "CRYPTO" | "OTHER";
export type MarketFilter = "ALL" | "US" | "HK" | "US+HK" | "CRYPTO" | "OTHER";
export type BrokerFilter = "ALL" | Broker;
export type Action = "BUY" | "SELL";
export type CashAction = "IN" | "OUT";

export interface Trade {
  id: string;
  date: string;        // ISO date (YYYY-MM-DD)
  ticker: string;      // bare ticker, e.g. "MSFT" or "1810" (no suffix)
  market: Market;
  broker: Broker;
  action: Action;
  quantity: number;    // 3 decimals
  price: number;       // 2 decimals, USD
  totalAmount: number; // price * quantity, 2 decimals
}

export interface CashEntry {
  id: string;
  date: string;
  broker: Broker;
  action: CashAction;
  amount: number;       // 2 decimals, USD
}

export interface OtherProductRecord {
  id: string;
  asOfDate: string;
  unrealizedGainLoss: number;   // USD, 2 decimals
  performancePct: number;
  totalAmount: number;          // USD, 2 decimals
  isLatest: boolean;
}

export interface DailySnapshot {
  date: string;           // the "bucketed" trading day this belongs to
  totalAssetsExCash: number;   // Number A
  totalAssetsWithCash: number; // Number D
  recordedAt: string;     // actual timestamp of when this was written
  isBackfilled: boolean;  // true if created by gap-fill logic, not a real visit
  isManuallyEdited: boolean;
}

export interface PriceCacheEntry {
  ticker: string;
  market: Market;
  price: number;          // USD, always converted if needed
  lastFetchedAt: string;
  lastFetchStatus: "success" | "fail";
}

export interface Position {
  ticker: string;
  market: Market;
  broker: Broker;
  quantity: number;
  totalCost: number;
  avgCost: number;
  currentPrice: number;
  currentValue: number;
  returnPct: number;
}

export interface AppSettings {
  lastOpenedAt: string;
  theme?: string;
  autoFetchPrices?: boolean;
}

export interface StorageOperationResult {
  success: boolean;
  error?: string;
}

