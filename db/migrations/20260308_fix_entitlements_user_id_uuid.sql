CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'entitlements'
      AND column_name = 'user_id'
      AND udt_name <> 'uuid'
  ) THEN
    ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS user_id_uuid UUID;

    UPDATE entitlements
    SET user_id_uuid = NULLIF(BTRIM(user_id::text), '')::uuid
    WHERE user_id IS NOT NULL
      AND user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    UPDATE entitlements
    SET user_id_uuid = owner_id::uuid
    WHERE user_id_uuid IS NULL
      AND owner_type = 'user'
      AND owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    ALTER TABLE entitlements DROP COLUMN user_id;
    ALTER TABLE entitlements RENAME COLUMN user_id_uuid TO user_id;
  END IF;
END $$;

ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE entitlements
  DROP CONSTRAINT IF EXISTS entitlements_user_id_fkey;

ALTER TABLE entitlements
  ADD CONSTRAINT entitlements_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS entitlements_user_id_idx ON entitlements(user_id);
