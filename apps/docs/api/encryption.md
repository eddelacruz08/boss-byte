# Encryption at rest

Sensitive columns are encrypted by the application with AES-256-GCM before they reach PostgreSQL.
The database, its backups and its replicas only ever hold ciphertext; your code only ever sees
plaintext.

In the starter, two columns are encrypted: `users.phone` and `users.totp_secret`.

| File                             | What it holds                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/api/src/lib/crypto/aes.ts` | The primitives: `Keyring`, `blindIndex`, `generateKey`. No dependencies beyond `node:crypto` |
| `apps/api/src/db/encryption.ts`  | Drizzle column types and helpers bound to the keys in the environment                        |
| `apps/api/src/db/rotate-keys.ts` | The key rotation command                                                                     |

## Encrypt a new column

Declare the column with `encryptedText` instead of `text`:

```ts
import { encryptedText } from './encryption';

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  taxId: encryptedText('customers.tax_id')('tax_id'),
});
```

In the migration it is an ordinary `text` column:

```sql
tax_id text
```

That is all. Reads and writes go through Drizzle as usual and are encrypted and decrypted on the
way:

```ts
await db.insert(customers).values({ name: 'Ada', taxId: '123-456-789' });

const [customer] = await db.select().from(customers).where(eq(customers.id, id));
customer?.taxId; // '123-456-789'
```

Then do one more thing: add the column to `ENCRYPTED_COLUMNS` in `src/db/rotate-keys.ts`, or key
rotation will skip it.

```ts
const ENCRYPTED_COLUMNS: EncryptedColumn[] = [
  { table: 'users', column: 'phone', context: 'users.phone' },
  { table: 'users', column: 'totp_secret', context: 'users.totp_secret' },
  { table: 'customers', column: 'tax_id', context: 'customers.tax_id' },
];
```

The rotation command pages through each table by a UUID `id` column, so encrypted tables need one.

For structured values there is `encryptedJson<T>(context)`, which stores encrypted JSON in a
`text` column:

```ts
address: encryptedJson<{ street: string; city: string }>('customers.address')('address'),
```

### The context

The string passed to `encryptedText` is the _context_. By convention it is `<table>.<column>`.
It is not secret, but it is bound into the ciphertext as additional authenticated data (AAD):

- A ciphertext copied from one column to another will not decrypt there.
- **It must never change once data exists.** If you rename the column, keep the old context
  string, or re-encrypt the data in a migration script.

## Payload format

Each value is stored as one printable string:

```text
v1.<keyId>.<iv>.<authTag>.<ciphertext>
```

| Part         | Content                                                      |
| ------------ | ------------------------------------------------------------ |
| `v1`         | Format version                                               |
| `keyId`      | First 8 hex characters of the SHA-256 of the key. Not secret |
| `iv`         | 96-bit random IV, new for every encryption                   |
| `authTag`    | 16-byte GCM authentication tag                               |
| `ciphertext` | The encrypted value                                          |

The last three parts are base64url. Two consequences:

- Encrypting the same value twice gives different output, so equal values are not visibly equal
  in the database.
- A modified or truncated payload fails to decrypt with a `DecryptionError`. It never returns
  garbage.

## Searching: blind indexes

Because encryption is randomised, `WHERE phone = $1` cannot match an encrypted column, and
`LIKE`, sorting and range queries are impossible. For exact-match lookup, store a _blind index_
next to the ciphertext: an HMAC-SHA256 of the normalised value under a separate key,
`BLIND_INDEX_KEY`.

The `users` table does this for phone numbers:

```ts
phone: encryptedText('users.phone')('phone'),
phoneBidx: text('phone_bidx'),
```

Write both together (`src/modules/users/users.service.ts`):

```ts
import { normalizePhone, searchableHash } from '../../db/encryption';

const PHONE_CONTEXT = 'users.phone';

function phoneColumns(phone: string | null) {
  if (phone === null) return { phone: null, phoneBidx: null };
  return { phone, phoneBidx: searchableHash(normalizePhone(phone), PHONE_CONTEXT) };
}
```

And look up by the index:

```ts
const hash = searchableHash(normalizePhone(phone), PHONE_CONTEXT);
const matches = await db.select().from(users).where(eq(users.phoneBidx, hash));
```

That is what `findUsersByPhone(phone)` does.

### Normalise before hashing

A blind index only matches byte-identical input, so reduce equivalent values to one form first.
`normalizePhone` keeps digits and a leading `+`:

```ts
normalizePhone(' +63 (917) 555-0101 '); // '+639175550101'
normalizePhone('+63-917-555-0101'); // '+639175550101'
normalizePhone('0917 555 0101'); // '09175550101'
```

Note the last line: it does not convert national numbers to international form.
`0917 555 0101` and `+63 917 555 0101` produce different indexes. If your users enter both,
convert to one form before storing.

For other kinds of value, write the equivalent: trim and lower-case an email, strip separators
from an ID number.

### What a blind index gives away

It is deterministic by design: two rows with the same phone number have the same index. Someone
who can read the database learns which rows share a value, though not the value. For low-entropy
data (a yes/no field, a birth year) that is too much, so do not index it. The `context` argument
keeps indexes from different columns from being comparable with each other.

## Keys

| Variable                        | Purpose                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `DATA_ENCRYPTION_KEY`           | The active key. Encrypts everything written from now on        |
| `DATA_ENCRYPTION_PREVIOUS_KEYS` | Retired keys, comma-separated. Used only to decrypt older rows |
| `BLIND_INDEX_KEY`               | HMAC key for blind indexes                                     |

Each is 32 random bytes, base64-encoded. `npm run setup` generates them for local development.
To generate one yourself:

```bash
openssl rand -base64 32
```

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

The API refuses to start if `DATA_ENCRYPTION_KEY` is not exactly 32 bytes.

In production, keep these in a secret manager, not in the image or the repository, and **back
them up separately from the database**. A database backup without its key is unreadable, by you
included. There is no recovery path.

## Rotating the data key

Rotation is a two-phase change with no downtime. The keyring can decrypt with any key it knows
and encrypts only with the active one.

1. **Generate a new key.**

   ```bash
   openssl rand -base64 32
   ```

2. **Swap the keys and deploy.** Put the new key in `DATA_ENCRYPTION_KEY` and move the old one to
   `DATA_ENCRYPTION_PREVIOUS_KEYS`:

   ```ini
   DATA_ENCRYPTION_KEY=<new key>
   DATA_ENCRYPTION_PREVIOUS_KEYS=<old key>
   ```

   Deploy the API and the worker. New writes use the new key; existing rows still decrypt with
   the old one.

3. **See what needs re-encrypting.**

   ```bash
   npm run db:rotate-keys -w @bossbyte/api -- --dry-run
   ```

   ```text
   3 value(s) would be re-encrypted. Run again without --dry-run.
   ```

4. **Re-encrypt.**

   ```bash
   npm run db:rotate-keys -w @bossbyte/api
   ```

   In a container, the same command is `node dist/rotate-keys.js`.

5. **Run it again** until it reports:

   ```text
   Every row is on the current key. Retired keys can be removed.
   ```

6. **Remove the old key** from `DATA_ENCRYPTION_PREVIOUS_KEYS` and deploy once more.

The command works in batches of 500 rows, can be interrupted and re-run, and is safe while the
API is serving traffic: it only updates a row if the value is still the one it read.

Locally, one command does steps 1 and 2 on `apps/api/.env`:

```bash
npm run setup -- --rotate-encryption-key
```

::: warning Do not remove a key early
If you remove a previous key while rows still use it, those rows can no longer be decrypted and
reading them throws a `DecryptionError`. Always finish with the dry run.
:::

### Rotating the blind index key

`BLIND_INDEX_KEY` is not part of the rotation command. Changing it changes every index, so every
`*_bidx` column must be recomputed from the decrypted values in a script of your own. Rotating the
data key does not affect blind indexes.

## What this does not protect against

Column encryption narrows who can read the data. It is one layer, not a complete answer.

**It protects against** someone who obtains the database without the application's keys: a leaked
backup or dump, a stolen disk or snapshot, a read replica or analytics copy, a curious database
administrator, SQL injection that reads rows.

**It does not protect against:**

- **A compromised application.** The API holds the keys and decrypts on request. Anyone who can
  run code in it, read its environment or call it with a stolen admin session sees plaintext.
- **Leaks above the database.** Decrypted values can still end up in logs, exports, emails and
  API responses. The logger redacts secrets by key name, not phone numbers. The user export
  contains phone numbers in clear text, as it is meant to.
- **Unencrypted columns.** Names, emails, roles and file metadata are stored in plaintext so they
  can be searched and sorted. Decide per column.
- **Metadata.** Whether a value is present, roughly how long it is, and (through a blind index)
  which rows share a value.
- **Files in object storage.** Uploaded files are not encrypted by the application. Turn on
  server-side encryption in the bucket.
- **Traffic.** Use TLS to PostgreSQL (`DATABASE_SSL=true`) and Redis, and HTTPS in front of the
  API.
- **Lost keys.** See above: no key, no data.

Passwords are a separate case: they are hashed with bcrypt, not encrypted, and cannot be
recovered by anyone.

## Using the primitives directly

`src/lib/crypto/aes.ts` has no dependency on the database or the environment, so you can use it
for anything else that needs encrypting:

```ts
import { blindIndex, generateKey, isEncrypted, Keyring } from '../lib/crypto/aes';

const keyring = Keyring.fromBase64(generateKey(), []);

const payload = keyring.encrypt('secret value', 'invoices.iban');
keyring.decrypt(payload, 'invoices.iban'); // 'secret value'
keyring.decrypt(payload, 'somewhere.else'); // throws DecryptionError

isEncrypted(payload); // true
keyring.needsRotation(payload); // false — it was written with the active key
```

Inside the API, import the ready-made `keyring` from `src/db/encryption.ts`, which is built from
the environment.
