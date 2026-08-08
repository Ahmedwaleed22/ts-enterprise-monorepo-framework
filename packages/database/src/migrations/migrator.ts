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
 * A directory of migration files, plus the name they are recorded under.
 *
 * @remarks
 * Packages that ship their own tables — a cache store, a session store, a job
 * queue — expose one of these so an application can opt in without copying
 * files it would then own. The `prefix` keeps the two namespaces apart: a file
 * shipped by a package can never shadow, or be shadowed by, one of the
 * application's.
 *
 * A package migration must not declare a foreign key into an application table.
 * Sources are merged by filename, so the relative order of two sources is not
 * something either one can rely on.
 *
 * @example
 * ```ts
 * { prefix: 'cache', path: join(here, 'migrations') }
 * ```
 *
 * @public
 */
export interface MigrationSource {
	/** Directory holding the migration files, resolved against the working directory. */
	path: string

	/**
	 * Recorded ahead of the filename, as `prefix:filename`.
	 *
	 * @remarks
	 * Applications leave this unset, so rows already in the tracking table keep
	 * the names they were written with.
	 *
	 * @defaultValue none, recording the bare filename
	 */
	prefix?: string
}

/**
 * Construction options for {@link Migrator}.
 *
 * @public
 */
export interface MigratorOptions {
	/**
	 * One directory, or several sources merged into a single ordered run.
	 *
	 * @remarks
	 * A bare string is equivalent to one unprefixed {@link MigrationSource}, so
	 * an application that owns all of its migrations never has to think about
	 * sources at all.
	 */
	path: string | readonly MigrationSource[]

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
	private readonly sources: readonly MigrationSource[]
	private readonly log: (message: string) => void

	/**
	 * @param connection - Database to migrate.
	 * @param options - Where the migrations live, and how to report progress.
	 */
	constructor(
		private readonly connection: Connection,
		options: MigratorOptions,
	) {
		this.sources =
			typeof options.path === 'string'
				? [{ path: resolve(options.path) }]
				: options.path.map((source) => ({ ...source, path: resolve(source.path) }))
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
		return (await this.discover()).map((entry) => entry.name)
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
		const pending = (await this.discover()).filter((entry) => !ran.has(entry.name))

		if (pending.length === 0) {
			this.log('Nothing to migrate.')
			return []
		}

		const batch = await this.repository.nextBatch()
		for (const entry of pending) {
			const migration = await this.load(entry.file, entry.name)
			this.log(`Migrating:  ${entry.name}`)
			await this.perform((schema, connection) => migration.up(schema, connection))
			await this.repository.log(entry.name, batch)
			this.log(`Migrated:   ${entry.name}`)
		}

		return pending.map((entry) => entry.name)
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

		// Rolling back starts from names in the tracking table rather than from
		// disk, so the files have to be looked up the other way round.
		const files = new Map((await this.discover()).map((entry) => [entry.name, entry.file]))

		const rolledBack: string[] = []
		for (let step = 0; step < steps; step += 1) {
			const batch = await this.repository.lastBatch()
			if (batch === 0) break

			for (const name of await this.repository.migrationsInBatch(batch)) {
				const migration = await this.load(this.fileFor(name, files), name)
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

		return (await this.discover()).map((entry) => ({
			migration: entry.name,
			batch: batches.get(entry.name),
			ran: batches.has(entry.name),
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

	/**
	 * Every migration across every source, in the order they should be applied.
	 *
	 * Read once per operation rather than once per migration, so a run costs one
	 * `readdir` per source however many files it applies.
	 */
	private async discover(): Promise<Discovered[]> {
		const found: Discovered[] = []

		for (const source of this.sources) {
			let entries: string[]
			try {
				entries = await readdir(source.path)
			} catch (error) {
				// A package that ships no migrations yet is not an error, and neither
				// is an application that has not written its first one.
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
				throw error
			}

			for (const entry of entries) {
				const extension = extname(entry)
				if (!SOURCE_EXTENSIONS.has(extension) || entry.endsWith('.d.ts')) continue

				const order = basename(entry, extension)
				found.push({
					order,
					name: source.prefix ? `${source.prefix}:${order}` : order,
					file: join(source.path, entry),
				})
			}
		}

		// Filenames are timestamp-prefixed, so lexical order is chronological
		// regardless of which source a file came from. The recorded name only
		// breaks ties, keeping the order stable when two sources happen to ship
		// the same timestamp.
		found.sort((a, b) => a.order.localeCompare(b.order) || a.name.localeCompare(b.name))

		// Equal names imply equal `order`, so duplicates are always adjacent here.
		const clash = found.find((entry, index) => found[index + 1]?.name === entry.name)
		if (clash) {
			throw new Error(
				`Two migration sources both provide "${clash.name}". ` +
					'Give one of them a `prefix` so they can be told apart.',
			)
		}

		return found
	}

	private fileFor(name: string, files: ReadonlyMap<string, string>): string {
		const file = files.get(name)
		if (!file) {
			const directories = this.sources.map((source) => source.path).join(', ')
			throw new Error(`Migration file for "${name}" was not found in ${directories}.`)
		}

		return file
	}

	private async load(file: string, name: string): Promise<Migration> {
		const module = (await import(pathToFileURL(file).href)) as MigrationModule

		if (!module.default) {
			throw new Error(`Migration "${name}" must have a default export.`)
		}

		return instantiate(module.default)
	}
}

/** One migration file, resolved to the name it is recorded under. */
interface Discovered {
	/** The name recorded in the tracking table, prefixed when the source is. */
	name: string
	/** Sort key — the bare filename, so timestamps order across sources. */
	order: string
	/** Absolute path to the file. */
	file: string
}
