import { describe, expect, test } from 'vitest'

import { envBoolean, envChoice, envNumber, envString } from '../src/env.js'

type Store = 'memory' | 'redis'

const STORE_ALIASES: Record<string, Store | undefined> = {
	memory: 'memory',
	array: 'memory',
	redis: 'redis',
}

describe('envString', () => {
	test('returns the value when set', () => {
		expect(envString({ CACHE_PREFIX: 'app' }, 'CACHE_PREFIX', 'cache')).toBe('app')
	})

	test('trims surrounding whitespace', () => {
		expect(envString({ CACHE_PREFIX: '  app  ' }, 'CACHE_PREFIX', 'cache')).toBe('app')
	})

	test('falls back when unset', () => {
		expect(envString({}, 'CACHE_PREFIX', 'cache')).toBe('cache')
	})

	test('treats a blank value as unset', () => {
		// `KEY=` in a .env file is someone clearing a setting, not choosing the
		// empty string — an empty prefix or table name fails far from its cause.
		expect(envString({ CACHE_PREFIX: '' }, 'CACHE_PREFIX', 'cache')).toBe('cache')
		expect(envString({ CACHE_PREFIX: '   ' }, 'CACHE_PREFIX', 'cache')).toBe('cache')
	})
})

describe('envBoolean', () => {
	test.each(['true', 'TRUE', '1', ' true '])('reads %s as true', (value) => {
		expect(envBoolean({ DB_SSL: value }, 'DB_SSL')).toBe(true)
	})

	test.each(['false', 'no', '0', 'yes'])('reads %s as false', (value) => {
		expect(envBoolean({ DB_SSL: value }, 'DB_SSL')).toBe(false)
	})

	test('defaults to false when unset', () => {
		expect(envBoolean({}, 'DB_SSL')).toBe(false)
	})

	test('honours an explicit fallback', () => {
		expect(envBoolean({}, 'DB_SSL', true)).toBe(true)
	})
})

describe('envNumber', () => {
	test('parses a numeric value', () => {
		expect(envNumber({ DB_PORT: '5433' }, 'DB_PORT', 5432)).toBe(5433)
	})

	test('falls back when unset or blank', () => {
		expect(envNumber({}, 'DB_PORT', 5432)).toBe(5432)
		expect(envNumber({ DB_PORT: '  ' }, 'DB_PORT', 5432)).toBe(5432)
	})

	test('rejects a value that is not a number', () => {
		// Letting NaN through surfaces much later as a connection error naming
		// neither the variable nor the value that caused it.
		expect(() => envNumber({ DB_PORT: 'five' }, 'DB_PORT', 5432)).toThrow(
			'DB_PORT must be a number, got "five".',
		)
	})

	test('accepts zero rather than treating it as unset', () => {
		expect(envNumber({ CACHE_TTL: '0' }, 'CACHE_TTL', 60)).toBe(0)
	})
})

describe('envChoice', () => {
	test('resolves a canonical name', () => {
		expect(
			envChoice({ CACHE_STORE: 'redis' }, 'CACHE_STORE', STORE_ALIASES, 'memory'),
		).toBe('redis')
	})

	test('resolves an alias to its canonical name', () => {
		expect(
			envChoice({ CACHE_STORE: 'array' }, 'CACHE_STORE', STORE_ALIASES, 'memory'),
		).toBe('memory')
	})

	test('is case-insensitive', () => {
		expect(
			envChoice({ CACHE_STORE: 'REDIS' }, 'CACHE_STORE', STORE_ALIASES, 'memory'),
		).toBe('redis')
	})

	test('falls back when unset', () => {
		expect(envChoice({}, 'CACHE_STORE', STORE_ALIASES, 'memory')).toBe('memory')
	})

	test('rejects an unknown choice and lists what is accepted', () => {
		expect(() =>
			envChoice({ CACHE_STORE: 'memcached' }, 'CACHE_STORE', STORE_ALIASES, 'memory'),
		).toThrow(
			'Unsupported value "memcached" for CACHE_STORE. Supported: memory, array, redis.',
		)
	})
})
