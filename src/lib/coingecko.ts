export const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  ADA: "cardano",
  XRP: "ripple",
  DOGE: "dogecoin",
  DOT: "polkadot",
  MATIC: "polygon",
  LINK: "chainlink",
  ROSE: "oasis-network",
  AVAX: "avalanche-2",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  XLM: "stellar",
  TRX: "tron",
  UNI: "uniswap",
  ATOM: "cosmos",
  ETC: "ethereum-classic",
  NEAR: "near",
  ICP: "internet-computer",
  APT: "aptos",
  FIL: "filecoin",
  OP: "optimism",
  ARB: "arbitrum",
  TON: "the-open-network",
  SUI: "sui",
  SHIB: "shiba-inu",
  PEPE: "pepe",
  INJ: "injective-protocol",
  HBAR: "hedera-hashgraph"
};

export function getCoingeckoIdForSymbol(symbol: string | null | undefined): string | null {
  if (!symbol) {
    return null;
  }

  return SYMBOL_TO_COINGECKO_ID[symbol.trim().toUpperCase()] || null;
}
