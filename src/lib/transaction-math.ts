export type FeeModel = "none" | "asset" | "base" | "other";

function norm(value?: string | null) {
  return (value || "").trim().toUpperCase();
}

export function resolveFeeModel(params: {
  assetSymbol?: string | null;
  feeCurrency?: string | null;
  baseCurrency?: string | null;
}) {
  const asset = norm(params.assetSymbol);
  const feeCurrency = norm(params.feeCurrency);
  const baseCurrency = norm(params.baseCurrency || "USD");

  if (!feeCurrency) {
    return "none" as FeeModel;
  }
  if (feeCurrency === asset) {
    return "asset" as FeeModel;
  }
  if (feeCurrency === baseCurrency) {
    return "base" as FeeModel;
  }
  return "other" as FeeModel;
}

export function computeTransactionPreview(params: {
  type: string;
  assetSymbol: string;
  quoteAssetSymbol?: string | null;
  quantity: number;
  price: number;
  feeAmount: number;
  feeCurrency?: string | null;
  baseCurrency?: string | null;
}) {
  const quantityGross = Math.max(0, Number(params.quantity || 0));
  const price = Math.max(0, Number(params.price || 0));
  const feeAmount = Math.max(0, Number(params.feeAmount || 0));
  const quoteAssetSymbol = norm(params.quoteAssetSymbol) || norm(params.baseCurrency || "USD");
  const feeModel = resolveFeeModel({
    assetSymbol: params.assetSymbol,
    feeCurrency: params.feeCurrency,
    baseCurrency: quoteAssetSymbol
  });

  const type = String(params.type || "BUY").toUpperCase();

  let quantityNet = quantityGross;
  let quantityReduced = quantityGross;
  let cost = quantityGross * price;
  let quoteDelta = 0;
  let grossProceeds = quantityGross * price;
  let netProceeds = quantityGross * price;
  let otherFeeDelta = 0;
  const feeCurrencyNorm = norm(params.feeCurrency);

  if (type === "BUY") {
    if (feeModel === "asset") {
      quantityNet = Math.max(0, quantityGross - feeAmount);
      cost = quantityGross * price;
    } else if (feeModel === "base") {
      quantityNet = quantityGross;
      cost = quantityGross * price + feeAmount;
    } else {
      quantityNet = quantityGross;
      cost = quantityGross * price;
    }
    quoteDelta = -cost;
    grossProceeds = quantityGross * price;
    netProceeds = Math.abs(quoteDelta);
  } else if (type === "SELL") {
    quantityNet = quantityGross;
    quantityReduced = feeModel === "asset" ? quantityGross + feeAmount : quantityGross;
    if (feeModel === "base") {
      cost = quantityGross * price - feeAmount; // net proceeds
    } else {
      cost = quantityGross * price;
    }
    quoteDelta = cost;
    grossProceeds = quantityGross * price;
    netProceeds = cost;
  }

  if (feeModel === "other" && feeCurrencyNorm) {
    otherFeeDelta = -feeAmount;
  }

  const worthAtTransaction = quantityNet * price;

  return {
    quoteAssetSymbol,
    feeModel,
    quantityGross,
    quantityNet,
    quantityReduced,
    quoteDelta,
    grossProceeds,
    netProceeds,
    otherFeeDelta,
    cost,
    worthAtTransaction
  };
}

export function computeQuoteAssetDelta(params: {
  type: string;
  quoteAssetSymbol?: string | null;
  quantity: number;
  price: number;
  feeAmount: number;
  feeCurrency?: string | null;
  assetSymbol?: string | null;
}) {
  const quote = norm(params.quoteAssetSymbol);
  if (!quote) {
    return 0;
  }
  const preview = computeTransactionPreview({
    type: params.type,
    assetSymbol: params.assetSymbol || "",
    quoteAssetSymbol: quote,
    quantity: params.quantity,
    price: params.price,
    feeAmount: params.feeAmount,
    feeCurrency: params.feeCurrency,
    baseCurrency: quote
  });
  return preview.quoteDelta;
}

export function computeSecondaryAssetDeltas(params: {
  type: string;
  assetSymbol: string;
  quoteAssetSymbol?: string | null;
  quantity: number;
  price: number;
  feeAmount: number;
  feeCurrency?: string | null;
}) {
  const asset = norm(params.assetSymbol);
  const quote = norm(params.quoteAssetSymbol);
  const feeCurrency = norm(params.feeCurrency);

  const preview = computeTransactionPreview({
    type: params.type,
    assetSymbol: asset,
    quoteAssetSymbol: quote,
    quantity: params.quantity,
    price: params.price,
    feeAmount: params.feeAmount,
    feeCurrency: feeCurrency || null,
    baseCurrency: quote || "USD"
  });

  const deltas: Array<{ symbol: string; delta: number; source: "quote" | "fee" }> = [];
  if (quote && quote !== asset && Number.isFinite(preview.quoteDelta) && preview.quoteDelta !== 0) {
    deltas.push({ symbol: quote, delta: preview.quoteDelta, source: "quote" });
  }
  if (feeCurrency && feeCurrency !== asset && feeCurrency !== quote && params.feeAmount > 0) {
    deltas.push({ symbol: feeCurrency, delta: -Math.abs(params.feeAmount), source: "fee" });
  }
  return deltas;
}

export function computeHoldingDelta(params: {
  type: string;
  assetSymbol: string;
  quantity: number;
  feeAmount: number;
  feeCurrency?: string | null;
  baseCurrency?: string | null;
}) {
  const type = String(params.type || "").toUpperCase();
  const quantity = Math.max(0, Number(params.quantity || 0));
  const feeAmount = Math.max(0, Number(params.feeAmount || 0));
  const feeModel = resolveFeeModel({
    assetSymbol: params.assetSymbol,
    feeCurrency: params.feeCurrency,
    baseCurrency: params.baseCurrency
  });

  if (type === "BUY" || type === "DEPOSIT") {
    if (feeModel === "asset") {
      return Math.max(0, quantity - feeAmount);
    }
    return quantity;
  }

  if (type === "SELL" || type === "WITHDRAW") {
    if (feeModel === "asset") {
      return -(quantity + feeAmount);
    }
    return -quantity;
  }

  if (type === "FEE") {
    return -quantity;
  }

  return 0;
}
