import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, test } from 'vitest'

import { createSqliteConnection } from '../src/connections/sqlite.js'
import { Migrator } from '../src/migrations/migrator.js'
import { Schema } from '../src/schema/schema.js'
import { SeederRunner } from '../src/seeders/runner.js'
import type { Connection } from '../src/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrations = join(here, 'fixtures/migrations')
const packageMigrations = join(here, 'fixtures/package-migrations')
const seeders = join(here, 'fixtures/seeders')

const silent = () => undefined

let connection: Connection

function migrator(): Migrator {
	return new Migrator(connection, { path: migrations, logger: silent })
}

beforeEach(async () => {
	// A fresh in-memory database per test keeps them independent without
	// needing a server or a temp file.
	connection = await createSqliteConnection({ dialect: 'sqlite', url: ':memory:' })
})

describe('running migrations', () => {
	test('applies every pending migration in filename order', async () => {
		expect(await migrator().run()).toEqual([
			'2026_01_01_000001_create_authors_table',
			'2026_01_01_000002_create_books_table',
		])

		const tables = await new Schema(connection).tableNames()
		expect(tables).toEqual(expect.arrayContaining(['authors', 'books', 'migrations']))
	})

	test('is idempotent — a second run applies nothing', async () => {
		await migrator().run()
		expect(await migrator().run()).toEqual([])
	})

	test('records every migration in a single batch', async () => {
		await migrator().run()

		const status = await migrator().status()
		expect(status.every((row) => row.ran)).toBe(true)
		expect(status.map((row) => row.batch)).toEqual([1, 1])
	})

	test('a migration added later lands in the next batch', async () => {
		await migrator().run()
		await connection.statement('delete from "migrations" where migration = ?', [
			'2026_01_01_000002_create_books_table',
		])
		await new Schema(connection).dropIfExists('books')

		await migrator().run()

		const status = await migrator().status()
		expect(status.find((row) => row.migration.endsWith('books_table'))?.batch).toBe(2)
	})
})

describe('rolling back', () => {
	test('reverses the batch in the opposite order it was applied', async () => {
		await migrator().run()

		// Books must go before authors, or the foreign key would block the drop.
		expect(await migrator().rollback()).toEqual([
			'2026_01_01_000002_create_books_table',
			'2026_01_01_000001_create_authors_table',
		])

		const tables = await new Schema(connection).tableNames()
		expect(tables).not.toContain('authors')
		expect(tables).not.toContain('books')
	})

	test('does nothing when there is no batch left', async () => {
		expect(await migrator().rollback()).toEqual([])
	})

	test('reset removes every batch', async () => {
		await migrator().run()
		await migrator().reset()

		expect(await migrator().status()).toEqual([
			expect.objectContaining({ ran: false }),
			expect.objectContaining({ ran: false }),
		])
	})

	test('migrations can be re-applied after a rollback', async () => {
		await migrator().run()
		await migrator().rollback()

		expect(await migrator().run()).toHaveLength(2)
	})
})

describe('fresh', () => {
	test('drops existing tables and rebuilds the schema', async () => {
		await migrator().run()
		await connection.statement('insert into "authors" (name, email) values (?, ?)', [
			'Left over',
			'stale@example.com',
		])

		await migrator().fresh()

		const rows = await connection.select<{ total: number }>(
			'select count(*) as total from "authors"',
		)
		expect(Number(rows[0]?.total)).toBe(0)
	})
})

describe('seeding', () => {
	beforeEach(async () => {
		await migrator().run()
	})

	test('inserts the seed data and its relations', async () => {
		await new SeederRunner(connection, { path: seeders, logger: silent }).run()

		const books = await connection.select<{ title: string; name: string }>(
			'select books.title, authors.name from books join authors on authors.id = books.author_id order by books.id',
		)

		expect(books).toEqual([
			{ title: 'A Wizard of Earthsea', name: 'Ursula K. Le Guin' },
			{ title: 'Invisible Cities', name: 'Italo Calvino' },
		])
	})

	test('re-seeding truncates first rather than duplicating rows', async () => {
		const runner = new SeederRunner(connection, { path: seeders, logger: silent })
		await runner.run()
		await runner.run()

		const rows = await connection.select<{ total: number }>(
			'select count(*) as total from authors',
		)
		expect(Number(rows[0]?.total)).toBe(2)
	})

	test('reports a helpful error for an unknown seeder', async () => {
		const runner = new SeederRunner(connection, { path: seeders, logger: silent })
		await expect(runner.run('NopeSeeder')).rejects.toThrow(/NopeSeeder/)
	})
})

describe('transactional safety', () => {
	test('a failing migration leaves no partial schema behind', async () => {
		const failing = new Migrator(connection, { path: migrations, logger: silent })
		await failing.run()

		// sqlite and Postgres both roll back DDL, so a mid-migration failure
		// must not leave a half-created table.
		await expect(
			connection.transaction(async (transaction) => {
				const schema = new Schema(transaction)
				await schema.create('partial', (table) => {
					table.id()
				})
				throw new Error('boom')
			}),
		).rejects.toThrow('boom')

		expect(await new Schema(connection).tableNames()).not.toContain('partial')
	})
})

describe('multiple migration sources', () => {
	function merged(): Migrator {
		return new Migrator(connection, {
			path: [{ path: migrations }, { path: packageMigrations, prefix: 'widgets' }],
			logger: silent,
		})
	}

	test('merges sources into one run ordered by filename', async () => {
		// Not source by source: the package fixture dated ...000000 has to land
		// before both application fixtures.
		expect(await merged().run()).toEqual([
			'widgets:2026_01_01_000000_create_settings_table',
			'2026_01_01_000001_create_authors_table',
			'2026_01_01_000002_create_books_table',
			'widgets:2026_01_01_000003_create_widgets_table',
		])

		expect(await new Schema(connection).tableNames()).toEqual(
			expect.arrayContaining(['settings', 'authors', 'books', 'widgets']),
		)
	})

	test('records prefixed names so a package cannot shadow the application', async () => {
		await merged().run()

		const rows = await connection.select<{ migration: string }>(
			'select migration from migrations order by id',
		)
		expect(rows.map((row) => row.migration)).toContain(
			'widgets:2026_01_01_000000_create_settings_table',
		)
	})

	test('leaves application migrations unprefixed', async () => {
		// Rows already in the tracking table were written before packages shipped
		// migrations, so the application's names must not change underneath them.
		await merged().run()

		expect(await merged().status()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					migration: '2026_01_01_000001_create_authors_table',
					ran: true,
				}),
			]),
		)
	})

	test('is idempotent across sources', async () => {
		await merged().run()
		expect(await merged().run()).toEqual([])
	})

	test('rolls back across sources, newest first', async () => {
		await merged().run()

		expect(await merged().rollback()).toEqual([
			'widgets:2026_01_01_000003_create_widgets_table',
			'2026_01_01_000002_create_books_table',
			'2026_01_01_000001_create_authors_table',
			'widgets:2026_01_01_000000_create_settings_table',
		])

		expect(await new Schema(connection).tableNames()).not.toContain('widgets')
	})

	test('a bare string path still behaves as one unprefixed source', async () => {
		// The overload has to stay compatible, or every existing tracking table
		// would look unmigrated.
		expect(await migrator().run()).toEqual([
			'2026_01_01_000001_create_authors_table',
			'2026_01_01_000002_create_books_table',
		])
	})

	test('rejects two sources providing the same recorded name', async () => {
		const clashing = new Migrator(connection, {
			path: [{ path: migrations }, { path: migrations }],
			logger: silent,
		})

		await expect(clashing.run()).rejects.toThrow(
			/Two migration sources both provide "2026_01_01_000001_create_authors_table"/,
		)
	})

	test('a prefix resolves what would otherwise clash', async () => {
		// Discovery only — actually running both would re-issue the same CREATE
		// TABLE. What matters is that the names no longer collide.
		const resolved = new Migrator(connection, {
			path: [{ path: migrations }, { path: migrations, prefix: 'twin' }],
			logger: silent,
		})

		expect(await resolved.available()).toEqual([
			'2026_01_01_000001_create_authors_table',
			'twin:2026_01_01_000001_create_authors_table',
			'2026_01_01_000002_create_books_table',
			'twin:2026_01_01_000002_create_books_table',
		])
	})

	test('ignores a source directory that does not exist', async () => {
		// A package that ships no migrations yet is not an error.
		const missing = new Migrator(connection, {
			path: [{ path: migrations }, { path: join(here, 'fixtures/nope'), prefix: 'nope' }],
			logger: silent,
		})

		expect(await missing.run()).toHaveLength(2)
	})
})

describe('foreign key enforcement', () => {
	test('rejects a row pointing at a missing parent', async () => {
		await migrator().run()

		// sqlite leaves foreign keys off unless asked; the connection turns
		// them on so behaviour matches Postgres and MySQL.
		await expect(
			connection.statement('insert into books (author_id, title) values (?, ?)', [
				999,
				'Orphan',
			]),
		).rejects.toThrow()
	})
})
