# @monorepo-framework/encryption

Encryption and signing keyed by a single **`APP_KEY`**.

One secret backs two operations. Encrypting hides a value from the client; signing lets the
client read it but not change it. Both derive their key from `APP_KEY` under different
labels, so there is still only one thing to rotate.

## Commands

Run from `apps/api` (see `apps/api/src/console/key.ts` for the wiring):

```bash
pnpm key:generate                # print a fresh key
pnpm key:generate --write        # write it into .env
pnpm key:generate --write --force  # replace a key that already exists
```

`--force` is required to replace an existing key, because rotating one invalidates every
encrypted cookie and every encrypted column. That should be a deliberate act.

## Configuration

```bash
APP_KEY=base64:2Nc7Sx1a...=   # 32 random bytes, base64
```

The `base64:` prefix is Laravel's, kept so the value is recognisable and pasteable. A key
must decode to exactly 32 bytes — a short one would still "work", just weaker, so the
length is checked rather than padded.

**When `APP_KEY` is missing**, behaviour depends on `NODE_ENV`. In production, encrypting
throws. Anywhere else it warns and uses a key generated for that process alone:

```
APP_KEY is not set — using a throwaway key for this process only.
```

A throwaway key is the honest default. Deriving a *stable* one from the project path or a
checked-in seed would look more helpful, but it means a secret nobody chose ends up in a
container image that appears to work. A random key fails visibly, in development, at the
cheapest possible moment: anything encrypted with it stops decrypting after a restart.

The key is resolved lazily, on the first encrypt or decrypt — so importing an application's
service wiring in a job with no `APP_KEY` does not fail every unrelated test.

## Encrypting

For anything the client must not read:

```ts
import { encrypterFromEnv } from "@monorepo-framework/encryption";

const encrypter = encrypterFromEnv();

const payload = encrypter.encrypt({ userId: 7 });
encrypter.decrypt<{ userId: number }>(payload); // { userId: 7 }
```

`encrypt` runs the value through `JSON.stringify`; `encryptString` skips that when you
already have a string. The type argument on `decrypt` states what you put in — it is not
validated, so treat it as you would `JSON.parse`.

Payloads look like `v1.<iv>.<tag>.<ciphertext>`, base64url throughout. The version prefix
means the scheme can change later without a flag day.

## Signing

For a value the client may read but must not change — a session id in a cookie, say:

```ts
const cookie = encrypter.sign(sessionId);
const sessionId = encrypter.unsign(cookie); // undefined if tampered with
```

`unsign` returns `undefined` rather than throwing. An invalid cookie is an everyday event —
an expired session, a rotated key, a client sending junk — and the response is to issue a
new one, not to treat it as an error.

Signed values cannot contain `.`, since that separates the value from its signature.

## Notes on the cryptography

Behaviour that is easy to get subtly wrong, and how it is handled here:

- **AES-256-GCM, with no separate HMAC.** GCM authenticates as well as encrypts, so a
  tampered payload fails to decrypt rather than yielding garbage. CBC-based schemes bolt on
  an HMAC because they have to; adding one here would be redundant.
- **A fresh 12-byte IV per call**, so encrypting the same plaintext twice gives unlinkable
  payloads. 12 bytes is GCM's native nonce size — longer nonces get hashed, shorter ones
  weaken it.
- **Separate derived keys per purpose**, via HKDF with a label. The cookie-signing key and
  the encryption key are unrelated, so a signature can never be used as an encryption
  oracle. The HKDF salt is empty on purpose: the input is already uniformly random, so this
  is domain separation rather than entropy extraction.
- **Signature comparison is timing-safe**, and length is checked first because
  `timingSafeEqual` throws on a mismatch.
- **Decryption failures are indistinguishable.** A wrong key, a tampered tag and a tampered
  ciphertext all produce the same message, so the error does not tell an attacker which
  part they got wrong.
