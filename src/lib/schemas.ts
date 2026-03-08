import { z } from "zod";

export const accountKindSchema = z.enum([
  "exchange",
  "fiat"
]);

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: accountKindSchema,
  baseCurrency: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/),
  notes: z.string().trim().max(2000).optional().nullable(),
  is_default: z.boolean().default(false)
}).strict();

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    kind: accountKindSchema.optional(),
    baseCurrency: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/).optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
    is_default: z.boolean().optional()
  })
  .strict()
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
  asset_symbol: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()),
  quote_asset_symbol: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()).optional().nullable(),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  gross_proceeds: z.number().nonnegative().optional().nullable(),
  net_proceeds: z.number().nonnegative().optional().nullable(),
  fee_amount: z.number().nonnegative().default(0),
  fee_currency: z.string().trim().max(20).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable()
}).strict();

export const updateTransactionSchema = createTransactionSchema;
