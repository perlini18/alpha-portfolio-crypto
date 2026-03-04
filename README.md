# crypto-tracker

Personal Portfolio Tracker (tipo Delta) para crypto con Next.js 14, PostgreSQL y SQL puro (`pg`) sin ORM.

## Stack

- Next.js 14+ (App Router)
- TypeScript
- TailwindCSS
- PostgreSQL (Docker local)
- SQL puro con paquete `pg`
- API Routes internas (Node.js)

## 1) Levantar PostgreSQL

```bash
docker compose up -d
```

## 2) Ejecutar script SQL manual

Usa `db/init.sql` en tu cliente de PostgreSQL favorito o `psql`:

```bash
psql postgresql://tracker:trackerpass@localhost:5432/trackerdb -f db/init.sql
```

Si tu tabla `assets` ya existe de una versión anterior:

```sql
ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_price_updated_at TIMESTAMP NULL;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'CRYPTO_EXCHANGE',
  ADD COLUMN IF NOT EXISTS notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

UPDATE accounts SET kind = 'CRYPTO_EXCHANGE' WHERE kind IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_default
ON accounts ((is_default))
WHERE is_default = TRUE;

-- Ads tables and seed
\i db/migrations/20260304_create_ads_tables_and_seed.sql
```

## 3) Instalar dependencias

```bash
npm install
```

Esto incluye `pg` y `zod`.

## 4) Correr en desarrollo

```bash
npm run dev
```

Abrir: `http://localhost:3000`

### Modo Pro (sin anuncios)

Los anuncios se desactivan si `NEXT_PUBLIC_PRO_MODE=true`.

Ejemplo en `.env`:

```env
NEXT_PUBLIC_PRO_MODE=false
```

### Ads-free por suscripción ($1 USD/mes)

Configura Stripe en `.env` (solo servidor):

```env
STRIPE_SECRET_KEY=sk_live_or_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID_ADS_FREE_MONTHLY=price_xxx
NEXT_PUBLIC_BILLING_USDT_ENABLED=false
```

Flujo:

- El carrusel muestra botón `X` para abrir modal "Remove ads for $1/mo".
- Opción USD crea Checkout Session en Stripe.
- Webhook de Stripe activa entitlement `ads_free`.
- Con entitlement activo, no se renderizan anuncios en Dashboard/Portfolio/Accounts/Transactions.

## Seed de ejemplo

Con la app corriendo, ejecuta:

```bash
curl -X POST http://localhost:3000/api/seed
```

Inserta:

- Accounts: Binance, GBM
- Assets: ETH, BNB, ADA
- Varias transacciones BUY/SELL

## Endpoints API

- `GET /api/accounts`
- `POST /api/accounts`

- `GET /api/ads?page=dashboard&limit=10`
- `POST /api/ads/event`
- `GET /api/entitlements/ads-free`
- `POST /api/billing/ads-free/checkout`
- `POST /api/webhooks/stripe`

- `GET /api/assets`
- `POST /api/assets`
- `PATCH /api/assets` (actualiza `last_price`)

- `GET /api/transactions?assetSymbol=ETH&accountId=1`
- `POST /api/transactions`

- `GET /api/portfolio/summary`
- `GET /api/portfolio/asset/[symbol]`

## UI

- `/` Dashboard: Total Worth, Total PnL, holdings
- `/assets`: listado de assets + edición inline de `last_price`
- `/assets/[symbol]`: métricas tipo Delta + transacciones
- `/transactions`: tabla + modal de alta

## Ads / Partners

El carrusel de anuncios se muestra en:

- Dashboard
- Portfolio
- Accounts
- Transactions

### Configurar anuncios por ENV

Define anuncios con variables `NEXT_PUBLIC_AD_{i}_*` (`i` de 1 a 20):

```env
NEXT_PUBLIC_AD_1_TITLE=...
NEXT_PUBLIC_AD_1_URL=https://...
NEXT_PUBLIC_AD_1_SUBTITLE=...
NEXT_PUBLIC_AD_1_BRAND=...
NEXT_PUBLIC_AD_1_CTA=...
NEXT_PUBLIC_AD_1_ACCENT=brand
```

Para anuncios bilingües (ES/EN), usa:

```env
NEXT_PUBLIC_AD_1_BRAND=Bybit
NEXT_PUBLIC_AD_1_URL=https://example.com
NEXT_PUBLIC_AD_1_TITLE_ES=Bybit: Promo en español
NEXT_PUBLIC_AD_1_TITLE_EN=Bybit: Promo in English
NEXT_PUBLIC_AD_1_SUBTITLE_ES=Subtítulo ES
NEXT_PUBLIC_AD_1_SUBTITLE_EN=Subtitle EN
NEXT_PUBLIC_AD_1_CTA_ES=Ver promo
NEXT_PUBLIC_AD_1_CTA_EN=Open promo
NEXT_PUBLIC_AD_1_ACCENT=indigo
NEXT_PUBLIC_AD_1_TAGS=exchange,crypto,promo
```

Notas:

- `TITLE` y `URL` son requeridos para que un anuncio se muestre.
- Si usas `TITLE_ES/TITLE_EN`, el endpoint `/api/ads?lang=es|en` selecciona idioma con fallback automático.
- `URL` debe iniciar con `http://` o `https://`.
- Si quieres quitar anuncios por owner (device/user/workspace), usa la tabla `entitlements` con `key='ads_free'`.
