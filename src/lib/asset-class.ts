export type AssetClass = "crypto" | "stock";

export function normalizeAssetClass(value: string | null | undefined): AssetClass {
  return value === "stock" ? "stock" : "crypto";
}
