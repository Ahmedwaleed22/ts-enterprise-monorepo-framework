import { beforeEach, describe, expect, test, vi } from 'vitest'

import { encrypterFromEnv } from '../src/config.js'
import { Encrypter } from '../src/encrypter.js'
import { generateKey, parseKey } from '../src/key.js'

let encrypter: Encrypter

beforeEach(() => {
	encrypter = new Encrypter(parseKey(generateKey()))
})

describe('encrypting', () => {
	test('round-trips an object', () => {
		const payload = encrypter.encrypt({ userId: 7, name: 'Ada' })
		expect(encrypter.decrypt(payload)).toEqual({ userId: 7, name: 'Ada' })
	})

	test.each([null, 0, false, '', [], { nested: { deep: true } }])(
		'round-trips %j',
		(value) => {
			expect(encrypter.decrypt(encrypter.encrypt(value))).toEqual(value)
		},
	)

	test('round-trips a string without JSON encoding', () => {
		expect(encrypter.decryptString(encrypter.encryptString('hello'))).toBe('hello')
	})

	test('round-trips multi-byte text', () => {
		const value = 'garçon — 日本語 — 🔐'
		expect(encrypter.decryptString(encrypter.encryptString(value))).toBe(value)
	})

	test('produces a different payload each time', () => {
		// A fresh IV per call, so identical plaintexts are not linkable.
		expect(encrypter.encrypt('same')).not.toBe(encrypter.encrypt('same'))
	})

	test('produces a versioned four-part payload', () => {
		const parts = encrypter.encryptString('hello').split('.')
		expect(parts).toHaveLength(4)
		expect(parts[0]).toBe('v1')
	})
})

describe('rejecting bad payloads', () => {
	test.each([
		['empty', ''],
		['not a payload', 'nonsense'],
		['too few parts', 'v1.aaa.bbb'],
		['unknown version', 'v2.aaa.bbb.ccc'],
	])('rejects %s', (_name, payload) => {
		expect(() => encrypter.decryptString(payload)).toThrow(
			'The payload is not a valid encrypted value.',
		)
	})

	test('rejects a tampered ciphertext', () => {
		// GCM authenticates as well as encrypts, so this fails rather than
		// returning garbage plaintext.
		const [version, iv, tag, ciphertext] = encrypter.encryptString('hello').split('.')
		const flipped = ciphertext.startsWith('A') ? `B${ciphertext.slice(1)}` : `A${ciphertext.slice(1)}`

		expect(() => encrypter.decryptString([version, iv, tag, flipped].join('.'))).toThrow(
			/tampered with or uses a different key/,
		)
	})

	test('rejects a tampered authentication tag', () => {
		const [version, iv, tag, ciphertext] = encrypter.encryptString('hello').split('.')
		const flipped = tag.startsWith('A') ? `B${tag.slice(1)}` : `A${tag.slice(1)}`

		expect(() => encrypter.decryptString([version, iv, flipped, ciphertext].join('.'))).toThrow(
			/tampered with or uses a different key/,
		)
	})

	test('rejects a payload encrypted under a different key', () => {
		const other = new Encrypter(parseKey(generateKey()))
		const payload = other.encryptString('hello')

		expect(() => encrypter.decryptString(payload)).toThrow(
			/tampered with or uses a different key/,
		)
	})

	test('rejects an IV of the wrong length', () => {
		const [version, , tag, ciphertext] = encrypter.encryptString('hello').split('.')
		const shortIv = Buffer.alloc(4).toString('base64url')

		expect(() => encrypter.decryptString([version, shortIv, tag, ciphertext].join('.'))).toThrow(
			'The payload is not a valid encrypted value.',
		)
	})
})

describe('signing', () => {
	test('round-trips a value', () => {
		expect(encrypter.unsign(encrypter.sign('session-id'))).toBe('session-id')
	})

	test('leaves the value readable', () => {
		// The point of signing rather than encrypting: the client may read it.
		expect(encrypter.sign('session-id').startsWith('session-id.')).toBe(true)
	})

	test('rejects a modified value', () => {
		const signed = encrypter.sign('session-id')
		expect(encrypter.unsign(signed.replace('session-id', 'other-id'))).toBeUndefined()
	})

	test('rejects a modified signature', () => {
		const signed = encrypter.sign('session-id')
		expect(encrypter.unsign(`${signed}x`)).toBeUndefined()
	})

	test('rejects a signature from a different key', () => {
		const other = new Encrypter(parseKey(generateKey()))
		expect(encrypter.unsign(other.sign('session-id'))).toBeUndefined()
	})

	test.each(['', 'no-separator'])('returns undefined for %j', (value) => {
		// An invalid cookie is an everyday event, not an error — the caller's
		// response is to issue a new one.
		expect(encrypter.unsign(value)).toBeUndefined()
	})

	test('refuses to sign a value containing the separator', () => {
		expect(() => encrypter.sign('has.separator')).toThrow('A signed value cannot contain "."')
	})

	test('a signature cannot be decrypted', () => {
		// Distinct derived keys, so one operation's output is useless to the other.
		expect(() => encrypter.decryptString(encrypter.sign('session-id'))).toThrow()
	})
})

describe('encrypterFromEnv', () => {
	test('uses APP_KEY when set', () => {
		const key = generateKey()
		const fromEnv = encrypterFromEnv({ APP_KEY: key })
		const direct = new Encrypter(parseKey(key))

		expect(fromEnv.decryptString(direct.encryptString('hello'))).toBe('hello')
	})

	test('refuses to run without a key in production', () => {
		const production = encrypterFromEnv({ NODE_ENV: 'production' })
		expect(() => production.encrypt('x')).toThrow(/APP_KEY is not set/)
	})

	test('warns and uses a throwaway key outside production', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

		const development = encrypterFromEnv({})
		expect(development.decrypt(development.encrypt('hello'))).toBe('hello')
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('throwaway key'))

		warn.mockRestore()
	})

	test('the throwaway key is stable for the life of the encrypter', () => {
		// Otherwise nothing encrypted early in a request could be read later in it.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

		const development = encrypterFromEnv({})
		const payload = development.encrypt('hello')
		expect(development.decrypt(payload)).toBe('hello')

		warn.mockRestore()
	})

	test('resolves the key lazily', () => {
		// Constructing must not throw, so importing an application's service
		// wiring in a job with no APP_KEY does not fail every unrelated test.
		expect(() => encrypterFromEnv({ NODE_ENV: 'production' })).not.toThrow()
	})
})
