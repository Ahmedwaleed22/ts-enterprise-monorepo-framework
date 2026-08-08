import { hkdfSync, randomBytes } from 'node:crypto'

/** AES-256 needs exactly this many bytes of key material. */
const KEY_BYTES = 32

/** Marks a key as base64-encoded, matching Laravel's `APP_KEY` format. */
const PREFIX = 'base64:'

/**
 * Generates a fresh application key.
 *
 * @remarks
 * The `base64:` prefix is Laravel's, kept so the value is recognisable and can
 * be pasted between projects. The bytes come from the system CSPRNG.
 *
 * @returns A key in `base64:...` form, ready to write into `.env`.
 *
 * @example
 * ```ts
 * process.env.APP_KEY = generateKey()
 * // base64:2Nc7Sx1a...=
 * ```
 *
 * @public
 */
export function generateKey(): string {
	return PREFIX + randomBytes(KEY_BYTES).toString('base64')
}

/**
 * Decodes an application key into raw bytes.
 *
 * @remarks
 * Rejects anything that is not exactly 32 bytes. A short key would still
 * "work" — it would just produce a weaker cipher — so the length is checked
 * rather than padded.
 *
 * @param value - The key, with or without the `base64:` prefix.
 * @returns The 32 raw key bytes.
 * @throws Error when the key is blank, malformed, or the wrong length.
 *
 * @example
 * ```ts
 * const key = parseKey('base64:2Nc7Sx1a...=')
 * ```
 *
 * @public
 */
export function parseKey(value: string): Buffer {
	const trimmed = value.trim()
	if (!trimmed) {
		throw new Error('The application key is empty. Generate one with `pnpm key:generate`.')
	}

	const encoded = trimmed.startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : trimmed
	const key = Buffer.from(encoded, 'base64')

	if (key.byteLength !== KEY_BYTES) {
		throw new Error(
			`The application key must decode to ${KEY_BYTES} bytes, got ${key.byteLength}. ` +
				'Generate a valid one with `pnpm key:generate`.',
		)
	}

	return key
}

/**
 * Derives a purpose-specific key from the application key.
 *
 * @remarks
 * One secret, several jobs. HKDF with a distinct `purpose` means the
 * cookie-signing key and the encryption key are unrelated: a signature can never
 * be used as an encryption oracle, and vice versa. Deriving beats storing two
 * secrets, because there is still only one thing to rotate.
 *
 * @param key - The application key, as returned by {@link parseKey}.
 * @param purpose - Label separating one derived key from another. Callers must
 * keep these stable — changing one invalidates everything derived under it.
 * @returns 32 bytes of key material unique to `purpose`.
 *
 * @example
 * ```ts
 * const cipherKey = deriveKey(key, 'encryption')
 * const signingKey = deriveKey(key, 'cookie-signing')
 * ```
 *
 * @public
 */
export function deriveKey(key: Buffer, purpose: string): Buffer {
	// An empty salt is correct here: the input is already uniformly random, so
	// HKDF is being used for domain separation rather than entropy extraction.
	return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), purpose, KEY_BYTES))
}
