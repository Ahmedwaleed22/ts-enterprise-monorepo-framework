import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from 'node:crypto'

import { deriveKey } from './key.js'

/** GCM's standard nonce length. Longer nonces are hashed, shorter ones weaken it. */
const IV_BYTES = 12

/** GCM authentication tag length in bytes. */
const TAG_BYTES = 16

/**
 * Payload format marker.
 *
 * Versioned so the scheme can change without a flag day: a future `v2` reader
 * can still recognise and decrypt `v1` values.
 */
const VERSION = 'v1'

/** Separates the parts of a payload. Not in the base64url alphabet. */
const SEPARATOR = '.'

/** Domain separation labels. Changing one invalidates everything under it. */
const CIPHER_PURPOSE = 'encryption'
const SIGNING_PURPOSE = 'cookie-signing'

/**
 * Supplies the application key, either directly or on first use.
 *
 * @remarks
 * The function form exists so a missing `APP_KEY` fails when something is
 * actually encrypted rather than when the module is imported — otherwise a CI
 * job with no key would fail every unrelated test that happens to import the
 * application's service wiring.
 *
 * @public
 */
export type KeyProvider = Buffer | (() => Buffer)

/**
 * Encrypts, decrypts and signs values with the application key.
 *
 * @remarks
 * Encryption is AES-256-GCM. GCM authenticates as well as encrypts, so a
 * tampered payload fails to decrypt rather than yielding garbage — there is
 * deliberately no separate HMAC, which CBC-based schemes need and GCM does not.
 *
 * Signing is a separate operation for values that must stay readable, such as a
 * session id in a cookie. Both use keys derived from the application key under
 * different labels, so neither can be used against the other.
 *
 * @example
 * ```ts
 * const encrypter = new Encrypter(parseKey(process.env.APP_KEY))
 *
 * const payload = encrypter.encrypt({ userId: 7 })
 * encrypter.decrypt<{ userId: number }>(payload) // { userId: 7 }
 * ```
 *
 * @public
 */
export class Encrypter {
	private readonly provide: () => Buffer

	private cached: Buffer | undefined

	/**
	 * @param key - The application key, or a function returning it on first use.
	 */
	constructor(key: KeyProvider) {
		this.provide = typeof key === 'function' ? key : (): Buffer => key
	}

	/**
	 * Encrypts a JSON-serialisable value.
	 *
	 * @param value - Anything `JSON.stringify` accepts.
	 * @returns An opaque payload safe to store or put in a cookie.
	 * @throws Error when the application key is missing or invalid.
	 *
	 * @example
	 * ```ts
	 * encrypter.encrypt({ userId: 7 })
	 * ```
	 */
	encrypt(value: unknown): string {
		return this.encryptString(JSON.stringify(value))
	}

	/**
	 * Decrypts a payload produced by {@link Encrypter.encrypt}.
	 *
	 * @typeParam T - Shape the caller expects. Not validated — the payload is
	 * known to be authentic, not known to match this type.
	 * @param payload - A payload from {@link Encrypter.encrypt}.
	 * @returns The original value.
	 * @throws Error when the payload is malformed, was tampered with, or was
	 * encrypted under a different key.
	 *
	 * @example
	 * ```ts
	 * encrypter.decrypt<{ userId: number }>(payload)
	 * ```
	 */
	// `T` cannot be inferred from the arguments — it is the caller stating what
	// they put in, exactly as `JSON.parse` is normally used. Returning `unknown`
	// would be more honest but would push the same unchecked cast to every call
	// site rather than removing it.
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
	decrypt<T>(payload: string): T {
		return JSON.parse(this.decryptString(payload)) as T
	}

	/**
	 * Encrypts a string without JSON-encoding it first.
	 *
	 * @param value - The plaintext.
	 * @returns A `v1.iv.tag.ciphertext` payload, base64url throughout.
	 * @throws Error when the application key is missing or invalid.
	 */
	encryptString(value: string): string {
		const iv = randomBytes(IV_BYTES)
		const cipher = createCipheriv('aes-256-gcm', this.keyFor(CIPHER_PURPOSE), iv)

		const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])

		return [
			VERSION,
			iv.toString('base64url'),
			cipher.getAuthTag().toString('base64url'),
			ciphertext.toString('base64url'),
		].join(SEPARATOR)
	}

	/**
	 * Decrypts a payload produced by {@link Encrypter.encryptString}.
	 *
	 * @param payload - The payload to decrypt.
	 * @returns The original plaintext.
	 * @throws Error when the payload is malformed, was tampered with, or was
	 * encrypted under a different key.
	 */
	decryptString(payload: string): string {
		const parts = payload.split(SEPARATOR)
		if (parts.length !== 4 || parts[0] !== VERSION) {
			throw new Error('The payload is not a valid encrypted value.')
		}

		const iv = Buffer.from(parts[1], 'base64url')
		const tag = Buffer.from(parts[2], 'base64url')
		if (iv.byteLength !== IV_BYTES || tag.byteLength !== TAG_BYTES) {
			throw new Error('The payload is not a valid encrypted value.')
		}

		const decipher = createDecipheriv('aes-256-gcm', this.keyFor(CIPHER_PURPOSE), iv)
		decipher.setAuthTag(tag)

		try {
			return Buffer.concat([
				decipher.update(Buffer.from(parts[3], 'base64url')),
				// Throws when the tag does not match, which is what makes a
				// tampered payload an error rather than garbage plaintext.
				decipher.final(),
			]).toString('utf8')
		} catch (error) {
			throw new Error('The payload has been tampered with or uses a different key.', {
				cause: error,
			})
		}
	}

	/**
	 * Appends a signature to a value that must stay readable.
	 *
	 * @remarks
	 * For things like a session id in a cookie: the client may read it, but must
	 * not be able to change it. Use {@link Encrypter.encrypt} instead when the
	 * value itself should stay secret.
	 *
	 * @param value - The value to sign. Must not contain the `.` separator.
	 * @returns The value with its signature appended.
	 * @throws Error when the value contains the separator, or the key is missing.
	 *
	 * @example
	 * ```ts
	 * const cookie = encrypter.sign(sessionId)
	 * ```
	 */
	sign(value: string): string {
		if (value.includes(SEPARATOR)) {
			throw new Error(`A signed value cannot contain "${SEPARATOR}".`)
		}

		return value + SEPARATOR + this.signature(value)
	}

	/**
	 * Verifies a value produced by {@link Encrypter.sign}.
	 *
	 * @remarks
	 * Returns `undefined` rather than throwing: an invalid cookie is an everyday
	 * event — an expired session, a rotated key, a client sending junk — and the
	 * caller's response is to issue a new one, not to treat it as an error.
	 *
	 * @param signed - The value with its signature appended.
	 * @returns The original value, or `undefined` when the signature does not
	 * match.
	 *
	 * @example
	 * ```ts
	 * const sessionId = encrypter.unsign(cookie) ?? createSession()
	 * ```
	 */
	unsign(signed: string): string | undefined {
		const index = signed.lastIndexOf(SEPARATOR)
		if (index <= 0) return undefined

		const value = signed.slice(0, index)
		const provided = Buffer.from(signed.slice(index + 1), 'base64url')
		const expected = Buffer.from(this.signature(value), 'base64url')

		// Length must match before `timingSafeEqual`, which throws otherwise.
		if (provided.byteLength !== expected.byteLength) return undefined
		return timingSafeEqual(provided, expected) ? value : undefined
	}

	private signature(value: string): string {
		return createHmac('sha256', this.keyFor(SIGNING_PURPOSE)).update(value).digest('base64url')
	}

	private keyFor(purpose: string): Buffer {
		// The application key is resolved once and kept, so a throwaway
		// development key stays stable for the life of the process.
		this.cached ??= this.provide()
		return deriveKey(this.cached, purpose)
	}
}
