import { expect, test } from 'vitest'

import { toPositionalPlaceholders } from '../src/connections/placeholders.js'

test('numbers each placeholder in order', () => {
	expect(toPositionalPlaceholders('insert into t (a, b) values (?, ?)')).toBe(
		'insert into t (a, b) values ($1, $2)',
	)
})

test('leaves question marks inside string literals alone', () => {
	// Seed data is full of prose; rewriting a `?` here would shift every
	// following placeholder and silently bind the wrong values.
	expect(toPositionalPlaceholders("select ? where title = 'Is it working?'")).toBe(
		"select $1 where title = 'Is it working?'",
	)
})

test('handles escaped quotes without losing track of the literal', () => {
	expect(toPositionalPlaceholders("select ? where a = 'it''s ? fine' and b = ?")).toBe(
		"select $1 where a = 'it''s ? fine' and b = $2",
	)
})

test('leaves question marks inside quoted identifiers alone', () => {
	expect(toPositionalPlaceholders('select "we?rd" from t where a = ?')).toBe(
		'select "we?rd" from t where a = $1',
	)
})

test('returns queries without placeholders unchanged', () => {
	expect(toPositionalPlaceholders('select 1')).toBe('select 1')
})
