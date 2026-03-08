ALTER TABLE assets
ADD COLUMN IF NOT EXISTS asset_class TEXT;

UPDATE assets
SET asset_class = CASE
  WHEN type = 'stock' THEN 'stock'
  ELSE 'crypto'
END
WHERE asset_class IS NULL;

ALTER TABLE assets
ALTER COLUMN asset_class SET DEFAULT 'crypto';

ALTER TABLE assets
ALTER COLUMN asset_class SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assets_asset_class_check'
  ) THEN
    ALTER TABLE assets
    ADD CONSTRAINT assets_asset_class_check
    CHECK (asset_class IN ('crypto', 'stock'));
  END IF;
END $$;
