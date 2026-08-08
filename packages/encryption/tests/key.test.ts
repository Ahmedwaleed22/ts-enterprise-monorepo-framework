import { describe, expect, test } from 'vitest'

import { deriveKey, generateKey, parseKey } from '../src/key.js'

describe('generateKey', () => {
	test('produces a base64-prefixed key', () => {
		expect(generateKey()).toMatch(/^base64:[A-Za-z0-9+/]{43}=$/)
	})

	test('decodes to 32 bytes', () => {
		expect(parseKey(generateKey()).byteLength).toBe(32)
	})

	test('is different every time', () => {
		expect(generateKey()).not.toBe(generateKey())
	})
})

describe('parseKey', () => {
	test('accepts a key with the prefix', () => {
		const key = generateKey()
		expect(parseKey(key).byteLength).toBe(32)
	})

	test('accepts a key without the prefix', () => {
		const key = generateKey()
		expect(parseKey(key.slice('base64:'.length))).toEqual(parseKey(key))
	})

	test('ignores surrounding whitespace', () => {
		const key = generateKey()
		expect(parseKey(`  ${key}  `)).toEqual(parseKey(key))
	})

	test('rejects a blank key', () => {
		expect(() => parseKey('')).toThrow('The application key is empty.')
		expect(() => parseKey('   ')).toThrow('The application key is empty.')
	})

	test('rejects a key of the wrong length', () => {
		// A short key would still "work" — it would just be weaker — so the
		// length is checked rather than padded.
		expect(() => parseKey('base64:c2hvcnQ=')).toThrow(
			/must decode to 32 bytes, got 5/,
		)
	})
})

describe('deriveKey', () => {
	test('is deterministic for a purpose', () => {
		const key = parseKey(generateKey())
		expect(deriveKey(key, 'encryption')).toEqual(deriveKey(key, 'encryption'))
	})

	test('gives unrelated keys to different purposes', () => {
		// This is what stops a signature being usable as an encryption oracle.
		const key = parseKey(generateKey())
		expect(deriveKey(key, 'encryption')).not.toEqual(deriveKey(key, 'cookie-signing'))
	})

	test('gives different keys for different application keys', () => {
		const purpose = 'encryption'
		expect(deriveKey(parseKey(generateKey()), purpose)).not.toEqual(
			deriveKey(parseKey(generateKey()), purpose),
		)
	})

	test('produces 32 bytes', () => {
		expect(deriveKey(parseKey(generateKey()), 'encryption').byteLength).toBe(32)
	})
})
