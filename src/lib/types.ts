export type TransactionType = "BUY" | "SELL" | "DEPOSIT" | "WITHDRAW" | "FEE";

export interface Account {
  id: number;
  name: string;
  kind: "exchange" | "fiat";
  base_currency: string;
  notes: string | null;
  is_default: boolean;
  created_at: string;
}

export interface Asset {
  symbol: string;
  name: string;
  type: "crypto" | "stock";
  last_price: number;
  updated_at: string;
}

export interface Transaction {
  id: number;
  datetime: string;
  type: TransactionType;
  account_id: number;
  asset_symbol: string;
  quantity: number;
  price: number;
  fee_amount: number;
  fee_currency: string | null;
  notes: string | null;
}

export interface PortfolioMetrics {
  qty: number;
  avgCost: number;
  realizedPnL: number;
  unrealized: number;
  marketValue: number;
  totalPnL: number;
}
