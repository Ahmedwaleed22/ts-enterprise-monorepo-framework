import { readdir } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { MigrationRepository } from './repository.js'
import { Schema } from '../schema/schema.js'
import { instantiate } from './migration.js'
import type { Migration, MigrationModule } from './migration.js'
import type { Connection } from '../types.js'

const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.js', '.mjs'])

export interface MigratorOptions {
	/** Directory holding the migration files. */
	path: string
	/** Name of the table tracking applied migrations. */
	table?: string
	/** Where progress is reported. Pass a noop logger to silence output. */
	logger?: (message: string) => void
}

export interface MigrationStatus {
	migration: string
	batch: number | undefined
	ran: boolean
}

/**
 * Discovers migration files, applies the pending ones and rolls them back in
 * reverse order, recording each step so runs are resumable and idempotent.
 */
export class Migrator {
	private readonly repository: MigrationRepository
	private readonly directory: string
	private readonly log: (message: string) => void

	constructor(
		private readonly connection: Connection,
		options: MigratorOptions,
	) {
		this.directory = resolve(options.path)
		this.repository = new MigrationRepository(connection, options.table)
		this.log = options.logger ?? ((message) => { console.log(message) })
	}

	/** Migration names on disk, in the order they should be applied. */
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

	/** Apply every migration that has not run yet. */
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

	/** Reverse the most recent `steps` batches. */
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

	/** Roll back every batch. */
	async reset(): Promise<string[]> {
		await this.repository.ensureExists()
		const batches = await this.repository.lastBatch()
		return this.rollback(batches)
	}

	/** Drop every table and migrate from scratch. */
	async fresh(): Promise<string[]> {
		this.log('Dropping all tables...')
		await new Schema(this.connection).dropAllTables()
		return this.run()
	}

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
