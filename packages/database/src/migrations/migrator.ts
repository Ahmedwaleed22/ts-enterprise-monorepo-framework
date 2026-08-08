import { readdir } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { MigrationRepository } from './repository.js'
import { Schema } from '../schema/schema.js'
import { instantiate } from './migration.js'
import type { Migration, MigrationModule } from './migration.js'
import type { Connection } from '../types.js'

const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.js', '.mjs'])

/**
 * Construction options for {@link Migrator}.
 *
 * @public
 */
export interface MigratorOptions {
	/** Directory holding the migration files, resolved against the working directory. */
	path: string

	/**
	 * Name of the table tracking applied migrations.
	 *
	 * @defaultValue `"migrations"`
	 */
	table?: string

	/**
	 * Where progress is reported. Pass a noop logger to silence output.
	 *
	 * @defaultValue `console.log`
	 */
	logger?: (message: string) => void
}

/**
 * One row of {@link Migrator.status}: a migration on disk, and whether it ran.
 *
 * @public
 */
export interface MigrationStatus {
	/** Migration name, i.e. its filename without extension. */
	migration: string
	/** Batch it was applied in, or `undefined` while still pending. */
	batch: number | undefined
	/** Whether the migration has been applied. */
	ran: boolean
}

/**
 * Discovers migration files, applies the pending ones and rolls them back in
 * reverse order, recording each step so runs are resumable and idempotent.
 *
 * @remarks
 * Each step is applied inside a transaction on Postgres and sqlite, so a
 * failure leaves nothing behind. MySQL commits implicitly on DDL, so the step
 * is deliberately *not* wrapped there — a transaction would only give a false
 * sense of atomicity.
 *
 * Migrations are imported dynamically at the moment they run, so a `.ts` file
 * needs a loader such as `tsx` in the running process.
 *
 * A migrator holds no state between calls; every method re-reads the directory
 * and the tracking table.
 *
 * @example
 * ```ts
 * const migrator = new Migrator(connection, { path: './src/database/migrations' })
 * await migrator.run()
 * ```
 *
 * @public
 */
export class Migrator {
	private readonly repository: MigrationRepository
	private readonly directory: string
	private readonly log: (message: string) => void

	/**
	 * @param connection - Database to migrate.
	 * @param options - Where the migrations live, and how to report progress.
	 */
	constructor(
		private readonly connection: Connection,
		options: MigratorOptions,
	) {
		this.directory = resolve(options.path)
		this.repository = new MigrationRepository(connection, options.table)
		this.log = options.logger ?? ((message) => { console.log(message) })
	}

	/**
	 * Migration names on disk, in the order they should be applied.
	 *
	 * @remarks
	 * Reads `.ts`, `.mts`, `.js` and `.mjs` files, ignoring declaration files.
	 * A missing directory yields an empty list rather than an error, so a
	 * project without migrations yet still runs.
	 *
	 * @returns Filenames without extension, sorted lexically — which is
	 * chronological, given the timestamp prefix convention.
	 */
	async available(): Promise<string[]> {
		let entries: string[]
		try {
			entries = await readdir(this.directory)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
			throw error
		}

		return entries
			.filter((entry) => SOURCE_EXTENSIONS.has(extname(entry)) && !entry.endsWith('.d.ts'))
			.map((entry) => basename(entry, extname(entry)))
			// Filenames are timestamp-prefixed, so lexical order is chronological.
			.sort((a, b) => a.localeCompare(b))
	}

	/**
	 * Apply every migration that has not run yet.
	 *
	 * @remarks
	 * All of them share one batch number, so a later `migrate:rollback` reverses
	 * exactly this run. Creates the tracking table on first use.
	 *
	 * @returns Names of the migrations applied, empty if nothing was pending.
	 * @throws Error if a migration file has no default export, is missing, or
	 * its `up` throws. Migrations applied before the failure stay applied and
	 * recorded.
	 */
	async run(): Promise<string[]> {
		await this.repository.ensureExists()

		const ran = new Set(await this.repository.ran())
		const pending = (await this.available()).filter((name) => !ran.has(name))

		if (pending.length === 0) {
			this.log('Nothing to migrate.')
			return []
		}

		const batch = await this.repository.nextBatch()
		for (const name of pending) {
			const migration = await this.resolve(name)
			this.log(`Migrating:  ${name}`)
			await this.perform((schema, connection) => migration.up(schema, connection))
			await this.repository.log(name, batch)
			this.log(`Migrated:   ${name}`)
		}

		return pending
	}

	/**
	 * Reverse the most recent `steps` batches.
	 *
	 * @remarks
	 * Within a batch, migrations are reversed newest first. Stops early once
	 * there is nothing left to roll back.
	 *
	 * @param steps - How many batches to reverse.
	 * @returns Names of the migrations reversed, in the order they were
	 * reversed.
	 * @throws Error if a migration's file is gone or its `down` throws.
	 */
	async rollback(steps = 1): Promise<string[]> {
		await this.repository.ensureExists()

		const rolledBack: string[] = []
		for (let step = 0; step < steps; step += 1) {
			const batch = await this.repository.lastBatch()
			if (batch === 0) break

			for (const name of await this.repository.migrationsInBatch(batch)) {
				const migration = await this.resolve(name)
				this.log(`Rolling back: ${name}`)
				await this.perform((schema, connection) => migration.down(schema, connection))
				await this.repository.remove(name)
				this.log(`Rolled back:  ${name}`)
				rolledBack.push(name)
			}
		}

		if (rolledBack.length === 0) this.log('Nothing to roll back.')
		return rolledBack
	}

	/**
	 * Roll back every batch.
	 *
	 * @remarks
	 * Runs each migration's `down`, so it depends on those being correct. When
	 * they are not, {@link Migrator.fresh} is the blunter alternative.
	 *
	 * @returns Names of the migrations reversed.
	 */
	async reset(): Promise<string[]> {
		await this.repository.ensureExists()
		const batches = await this.repository.lastBatch()
		return this.rollback(batches)
	}

	/**
	 * Drop every table and migrate from scratch.
	 *
	 * @remarks
	 * Destroys all data in the database, including the tracking table, and never
	 * calls a migration's `down`. Intended for development and test databases.
	 *
	 * @returns Names of the migrations applied afterwards.
	 */
	async fresh(): Promise<string[]> {
		this.log('Dropping all tables...')
		await new Schema(this.connection).dropAllTables()
		return this.run()
	}

	/**
	 * Which migrations exist, and which have run.
	 *
	 * @remarks
	 * Driven by the files on disk, so a migration recorded in the table but no
	 * longer present is not reported.
	 *
	 * @returns One entry per migration file, in application order.
	 */
	async status(): Promise<MigrationStatus[]> {
		await this.repository.ensureExists()
		const batches = new Map(
			(await this.repository.ranRecords()).map((record) => [record.migration, record.batch]),
		)

		return (await this.available()).map((migration) => ({
			migration,
			batch: batches.get(migration),
			ran: batches.has(migration),
		}))
	}

	/**
	 * Run one migration step, wrapped in a transaction where the database can
	 * roll back DDL. MySQL commits implicitly on DDL, so wrapping there would
	 * only give a false sense of atomicity.
	 */
	private async perform(
		step: (schema: Schema, connection: Connection) => Promise<void> | void,
	): Promise<void> {
		if (this.connection.dialect === 'mysql') {
			await step(new Schema(this.connection), this.connection)
			return
		}

		await this.connection.transaction(async (transaction) => {
			await step(new Schema(transaction), transaction)
		})
	}

	private async resolve(name: string): Promise<Migration> {
		const file = await this.fileFor(name)
		const module = (await import(pathToFileURL(file).href)) as MigrationModule

		if (!module.default) {
			throw new Error(`Migration "${name}" must have a default export.`)
		}

		return instantiate(module.default)
	}

	private async fileFor(name: string): Promise<string> {
		const entries = await readdir(this.directory)
		const match = entries.find(
			(entry) => basename(entry, extname(entry)) === name && SOURCE_EXTENSIONS.has(extname(entry)),
		)

		if (!match) {
			throw new Error(`Migration file for "${name}" was not found in ${this.directory}.`)
		}

		return join(this.directory, match)
	}
}
