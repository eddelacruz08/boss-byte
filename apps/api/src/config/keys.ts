import { readFileSync } from 'node:fs';
import { env } from './env';

export interface JwtKeys {
  privateKey: string;
  publicKey: string;
}

let cached: JwtKeys | undefined;

function readKey(inline: string | undefined, path: string, label: string): string {
  if (inline) return Buffer.from(inline, 'base64').toString('utf8');
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `Could not read the JWT ${label} key at "${path}". Run "npm run setup" to generate a key pair, ` +
        `or provide it base64-encoded in JWT_${label.toUpperCase()}_KEY.`,
    );
  }
}

/** The RS256 key pair used to sign and verify JWTs. Loaded once, on first use. */
export function getJwtKeys(): JwtKeys {
  cached ??= {
    privateKey: readKey(env.JWT_PRIVATE_KEY, env.JWT_PRIVATE_KEY_PATH, 'private'),
    publicKey: readKey(env.JWT_PUBLIC_KEY, env.JWT_PUBLIC_KEY_PATH, 'public'),
  };
  return cached;
}
