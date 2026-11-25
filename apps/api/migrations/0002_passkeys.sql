-- 0002: WebAuthn passkeys.

CREATE TABLE passkeys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key    text NOT NULL,
  counter       bigint NOT NULL DEFAULT 0,
  device_type   text NOT NULL,
  backed_up     boolean NOT NULL DEFAULT false,
  transports    jsonb NOT NULL DEFAULT '[]'::jsonb,
  name          text NOT NULL,
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX passkeys_user_id_idx ON passkeys (user_id);
