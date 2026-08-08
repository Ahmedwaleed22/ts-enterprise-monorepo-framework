import { Schema } from '../schema/schema.js'
import type { Connection } from '../types.js'

export interface MigrationRecord {
	migration: string
	batch: number
}

/**
 * Tracks which migrations have run, in a table that lives alongside the
 * application's own schema.
 */
export class MigrationRepository {
	private readonly schema: Schema

	constructor(
		private readonly connection: Connection,
		private readonly table = 'migrations',
	) {
		this.schema = new Schema(connection)
	}

	/** Create the tracking table if this is the first run. */
	async ensureExists(): Promise<void> {
		if (await this.schema.hasTable(this.table)) return

		await this.schema.create(this.table, (table) => {
			table.id()
			table.string('migration')
			table.integer('batch')
		})
	}

	async ran(): Promise<string[]> {
		return (await this.ranRecords()).map((record) => record.migration)
	}

	/** Every applied migration with the batch it belongs to. */
	async ranRecords(): Promise<MigrationRecord[]> {
		const rows = await this.connection.select<{ migration: string; batch: number }>(
			`select migration, batch from ${this.wrapped} order by batch asc, id asc`,
		)
		return rows.map((row) => ({ migration: row.migration, batch: Number(row.batch) }))
	}

	async lastBatch(): Promise<number> {
		const rows = await this.connection.select<{ batch: number | null }>(
			`select max(batch) as batch from ${this.wrapped}`,
		)
		// MySQL and sqlite report an empty aggregate as null rather than 0.
		return Number(rows[0]?.batch ?? 0)
	}

	async nextBatch(): Promise<number> {
		return (await this.lastBatch()) + 1
	}

	/** Migrations in the given batch, newest first — the rollback order. */
	async migrationsInBatch(batch: number): Promise<string[]> {
		const rows = await this.connection.select<{ migration: string }>(
			`select migration from ${this.wrapped} where batch = ? order by id desc`,
			[batch],
		)
		return rows.map((row) => row.migration)
	}

	async log(migration: string, batch: number): Promise<void> {
		await this.connection.statement(
			`insert into ${this.wrapped} (migration, batch) values (?, ?)`,
			[migration, batch],
		)
	}

	async remove(migration: string): Promise<void> {
		await this.connection.statement(`delete from ${this.wrapped} where migration = ?`, [
			migration,
		])
	}

	private get wrapped(): string {
		return this.schema.grammar.wrap(this.table)
	}
}
