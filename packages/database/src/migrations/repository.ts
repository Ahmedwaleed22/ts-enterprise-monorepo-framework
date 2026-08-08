import { Schema } from '../schema/schema.js'
import type { Connection } from '../types.js'

/**
 * One row of the migrations tracking table.
 *
 * @public
 */
export interface MigrationRecord {
	/** Migration name, i.e. its filename without extension. */
	migration: string
	/** Batch it was applied in; a rollback reverses one whole batch. */
	batch: number
}

/**
 * Tracks which migrations have run, in a table that lives alongside the
 * application's own schema.
 *
 * @remarks
 * {@link Migrator} owns an instance and drives it; use this directly only to
 * inspect or repair migration state — for example to mark a migration as
 * applied after running its DDL by hand.
 *
 * Every method except {@link MigrationRepository.ensureExists} assumes the
 * table exists.
 *
 * @public
 */
export class MigrationRepository {
	private readonly schema: Schema

	/**
	 * @param connection - Database holding the tracking table.
	 * @param table - Tracking table name.
	 */
	constructor(
		private readonly connection: Connection,
		private readonly table = 'migrations',
	) {
		this.schema = new Schema(connection)
	}

	/**
	 * Create the tracking table if this is the first run.
	 *
	 * @remarks
	 * Safe to call repeatedly; it checks the catalogue first.
	 */
	async ensureExists(): Promise<void> {
		if (await this.schema.hasTable(this.table)) return

		await this.schema.create(this.table, (table) => {
			table.id()
			table.string('migration')
			table.integer('batch')
		})
	}

	/**
	 * Names of every applied migration, oldest batch first.
	 *
	 * @returns Migration names in application order.
	 */
	async ran(): Promise<string[]> {
		return (await this.ranRecords()).map((record) => record.migration)
	}

	/**
	 * Every applied migration with the batch it belongs to.
	 *
	 * @returns Records ordered by batch, then by insertion.
	 */
	async ranRecords(): Promise<MigrationRecord[]> {
		const rows = await this.connection.select<{ migration: string; batch: number }>(
			`select migration, batch from ${this.wrapped} order by batch asc, id asc`,
		)
		return rows.map((row) => ({ migration: row.migration, batch: Number(row.batch) }))
	}

	/**
	 * The highest batch number recorded.
	 *
	 * @returns The last batch, or `0` when nothing has been applied.
	 */
	async lastBatch(): Promise<number> {
		const rows = await this.connection.select<{ batch: number | null }>(
			`select max(batch) as batch from ${this.wrapped}`,
		)
		// MySQL and sqlite report an empty aggregate as null rather than 0.
		return Number(rows[0]?.batch ?? 0)
	}

	/**
	 * The batch number the next migration run should use.
	 *
	 * @returns {@link MigrationRepository.lastBatch} plus one.
	 */
	async nextBatch(): Promise<number> {
		return (await this.lastBatch()) + 1
	}

	/**
	 * Migrations in the given batch, newest first — the rollback order.
	 *
	 * @param batch - Batch number to list.
	 * @returns Migration names, most recently applied first.
	 */
	async migrationsInBatch(batch: number): Promise<string[]> {
		const rows = await this.connection.select<{ migration: string }>(
			`select migration from ${this.wrapped} where batch = ? order by id desc`,
			[batch],
		)
		return rows.map((row) => row.migration)
	}

	/**
	 * Record a migration as applied.
	 *
	 * @param migration - Migration name.
	 * @param batch - Batch it belongs to.
	 */
	async log(migration: string, batch: number): Promise<void> {
		await this.connection.statement(
			`insert into ${this.wrapped} (migration, batch) values (?, ?)`,
			[migration, batch],
		)
	}

	/**
	 * Forget a migration, so it counts as pending again.
	 *
	 * @param migration - Migration name. Removing one that was never recorded is
	 * a no-op.
	 */
	async remove(migration: string): Promise<void> {
		await this.connection.statement(`delete from ${this.wrapped} where migration = ?`, [
			migration,
		])
	}

	private get wrapped(): string {
		return this.schema.grammar.wrap(this.table)
	}
}
