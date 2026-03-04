import { z } from "zod";

export const accountKindSchema = z.enum([
  "exchange",
  "fiat"
]);

export const createAccountSchema = z.object({
  name: z.string().min(1),
  kind: accountKindSchema,
  baseCurrency: z.string().min(1),
  notes: z.string().optional().nullable(),
  is_default: z.boolean().default(false)
});

export const updateAccountSchema = z
  .object({
    name: z.string().min(1).optional(),
    kind: accountKindSchema.optional(),
    baseCurrency: z.string().optional(),
    notes: z.string().optional().nullable(),
    is_default: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export const createAssetSchema = z.object({
  symbol: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .refine((value) => value.length >= 2 && value.length <= 15, {
      message: "Symbol must be between 2 and 15 characters"
    }),
  name: z.string().min(1),
  type: z.enum(["crypto", "stock"]),
  last_price: z.number().nonnegative().default(0)
});

export const patchAssetPriceSchema = z.object({
  symbol: z.string().min(1).transform((s) => s.toUpperCase()),
  last_price: z.number().nonnegative()
});

export const createTransactionSchema = z.object({
  datetime: z.string().datetime(),
  type: z.enum(["BUY", "SELL", "DEPOSIT", "WITHDRAW", "FEE"]),
  account_id: z.number().int().positive(),
  asset_symbol: z.string().min(1).transform((s) => s.toUpperCase()),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  fee_amount: z.number().nonnegative().default(0),
  fee_currency: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const updateTransactionSchema = createTransactionSchema;
