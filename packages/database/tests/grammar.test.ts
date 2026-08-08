import { describe, expect, test } from 'vitest'

import { Blueprint } from '../src/schema/blueprint.js'
import { raw } from '../src/schema/expression.js'
import { grammarFor } from '../src/schema/grammars/index.js'
import type { Dialect } from '../src/types.js'

const DIALECTS: Dialect[] = ['postgres', 'mysql', 'sqlite']

/** The dummy `users` table, as the shipped migration defines it. */
function usersBlueprint(): Blueprint {
	const blueprint = new Blueprint('users')
	blueprint.id()
	blueprint.string('name')
	blueprint.string('email').unique()
	blueprint.string('role', 32).default('member')
	blueprint.boolean('is_active').default(true)
	blueprint.timestamps()
	return blueprint
}

/** The dummy `posts` table, exercising foreign keys and composite indexes. */
function postsBlueprint(): Blueprint {
	const blueprint = new Blueprint('posts')
	blueprint.id()
	blueprint.foreignId('user_id').constrained('users')
	blueprint.string('title')
	blueprint.text('body').nullable()
	blueprint.timestamp('published_at').nullable()
	blueprint.index(['user_id', 'published_at'])
	return blueprint
}

describe('auto-incrementing primary keys', () => {
	test('postgres uses bigserial', () => {
		const [create] = grammarFor('postgres').compileCreate(usersBlueprint())
		expect(create).toContain('"id" bigserial not null primary key')
	})

	test('mysql uses auto_increment', () => {
		const [create] = grammarFor('mysql').compileCreate(usersBlueprint())
		expect(create).toContain('`id` bigint unsigned not null auto_increment primary key')
	})

	test('sqlite uses the integer rowid alias required for autoincrement', () => {
		const [create] = grammarFor('sqlite').compileCreate(usersBlueprint())
		// sqlite only treats the column as a rowid alias with exactly this
		// spelling — `bigint primary key autoincrement` is rejected.
		expect(create).toContain('"id" integer not null primary key autoincrement')
	})
})

describe('boolean defaults', () => {
	test('postgres emits a real boolean literal', () => {
		const [create] = grammarFor('postgres').compileCreate(usersBlueprint())
		expect(create).toContain('"is_active" boolean not null default true')
	})

	test.each([
		['mysql', '`is_active` tinyint(1) not null default 1'],
		['sqlite', '"is_active" integer not null default 1'],
	] as const)('%s stores booleans as 1/0', (dialect, expected) => {
		const [create] = grammarFor(dialect).compileCreate(usersBlueprint())
		expect(create).toContain(expected)
	})
})

describe('string defaults', () => {
	test.each(DIALECTS)('%s quotes and escapes literals', (dialect) => {
		const blueprint = new Blueprint('t')
		blueprint.string('label').default("it's fine")

		const [create] = grammarFor(dialect).compileCreate(blueprint)
		expect(create).toContain("default 'it''s fine'")
	})

	test.each(DIALECTS)('%s passes raw expressions through untouched', (dialect) => {
		const blueprint = new Blueprint('t')
		blueprint.timestamp('created_at').default(raw('CURRENT_TIMESTAMP'))

		const [create] = grammarFor(dialect).compileCreate(blueprint)
		expect(create).toContain('default CURRENT_TIMESTAMP')
	})
})

describe('foreign keys', () => {
	test.each(DIALECTS)('%s declares the constraint inside CREATE TABLE', (dialect) => {
		const [create] = grammarFor(dialect).compileCreate(postsBlueprint())

		// sqlite cannot add a foreign key after the fact, so every dialect
		// declares them inline to keep the migration portable.
		expect(create).toMatch(/constraint .posts_user_id_foreign./)
		expect(create).toMatch(/foreign key \(.user_id.\) references .users. \(.id.\)/)
		expect(create).toContain('on delete cascade')
	})

	test('foreign key column types match the referenced key', () => {
		const [posts] = grammarFor('mysql').compileCreate(postsBlueprint())
		const [users] = grammarFor('mysql').compileCreate(usersBlueprint())

		// A signed bigint cannot reference an unsigned one in MySQL.
		expect(users).toContain('`id` bigint unsigned')
		expect(posts).toContain('`user_id` bigint unsigned not null')
	})
})

describe('indexes', () => {
	test.each(DIALECTS)('%s emits indexes as separate statements', (dialect) => {
		const statements = grammarFor(dialect).compileCreate(usersBlueprint())

		expect(statements).toHaveLength(2)
		expect(statements[1]).toMatch(
			/create unique index .users_email_unique. on .users. \(.email.\)/,
		)
	})

	test.each(DIALECTS)('%s names composite indexes after their columns', (dialect) => {
		const statements = grammarFor(dialect).compileCreate(postsBlueprint())

		expect(statements.at(-1)).toMatch(
			/create index .posts_user_id_published_at_index. on .posts. \(.user_id., .published_at.\)/,
		)
	})

	test('mysql scopes DROP INDEX to its table', () => {
		expect(grammarFor('mysql').compileDropIndex('posts', 'posts_slug_unique')).toBe(
			'drop index `posts_slug_unique` on `posts`',
		)
	})
})

describe('altering tables', () => {
	test.each(DIALECTS)('%s adds one column per statement', (dialect) => {
		const blueprint = new Blueprint('users', 'alter')
		blueprint.string('nickname').nullable()
		blueprint.integer('login_count').default(0)

		const statements = grammarFor(dialect).compileAlter(blueprint)

		// sqlite rejects more than one ADD COLUMN per ALTER TABLE.
		expect(statements).toHaveLength(2)
		expect(statements[0]).toMatch(/^alter table .users. add column .nickname./)
		expect(statements[1]).toMatch(/^alter table .users. add column .login_count./)
	})
})

describe('dropping every table', () => {
	test('postgres relies on CASCADE to ignore dependency order', () => {
		expect(grammarFor('postgres').compileDropAllTables(['posts', 'users'])).toEqual([
			'drop table if exists "posts", "users" cascade',
		])
	})

	test('mysql suspends foreign key checks', () => {
		expect(grammarFor('mysql').compileDropAllTables(['posts', 'users'])).toEqual([
			'set foreign_key_checks = 0',
			'drop table if exists `posts`, `users`',
			'set foreign_key_checks = 1',
		])
	})

	test('sqlite drops one table at a time with foreign keys off', () => {
		expect(grammarFor('sqlite').compileDropAllTables(['posts', 'users'])).toEqual([
			'pragma foreign_keys = off',
			'drop table if exists "posts"',
			'drop table if exists "users"',
			'pragma foreign_keys = on',
		])
	})

	test.each(DIALECTS)('%s emits nothing when the database is empty', (dialect) => {
		expect(grammarFor(dialect).compileDropAllTables([])).toEqual([])
	})
})

describe('identifier quoting', () => {
	test.each([
		['postgres', '"order"'],
		['mysql', '`order`'],
		['sqlite', '"order"'],
	] as const)('%s quotes reserved words', (dialect, expected) => {
		expect(grammarFor(dialect).wrap('order')).toBe(expected)
	})

	test.each([
		['postgres', '"a""b"'],
		['mysql', '`a``b`'],
	] as const)('%s escapes an embedded quote character', (dialect, expected) => {
		expect(grammarFor(dialect).wrap(dialect === 'mysql' ? 'a`b' : 'a"b')).toBe(expected)
	})
})
