-- 0001: accounts, refresh-token sessions and the audit trail.
--
-- Migrations are plain SQL, written by hand and applied in filename order by
-- `npm run db:migrate`. Each file runs inside one transaction. Never edit a
-- migration that has been applied anywhere — add a new one instead.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text,
  role          text NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'manager', 'staff', 'viewer')),
  -- AES-256-GCM ciphertext (see apps/api/src/lib/crypto/aes.ts). Never query
  -- these columns by value; use the blind index next to them.
  phone         text,
  phone_bidx    text,
  totp_secret   text,
  totp_enabled  boolean NOT NULL DEFAULT false,
  firebase_uid  text UNIQUE,
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);

CREATE INDEX users_phone_bidx_idx ON users (phone_bidx);

CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id  uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_id_idx ON refresh_tokens (family_id);

CREATE TABLE audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  action     text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_user_id_idx ON audit_logs (user_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at);
