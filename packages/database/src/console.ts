import { createConnection } from './connections/index.js'
import { Migrator } from './migrations/migrator.js'
import { SeederRunner } from './seeders/runner.js'
import type { MigrationSource } from './migrations/migrator.js'
import type { ConnectionConfig } from './types.js'

/**
 * Wiring an application supplies to {@link runConsole}.
 *
 * @public
 */
export interface ConsoleOptions {
	/**
	 * Directory holding migration files.
	 *
	 * @remarks
	 * Resolved relative to the process working directory, so prefer an absolute
	 * path derived from `import.meta.url`.
	 */
	migrations: string

	/**
	 * Migrations owned by packages rather than by the application.
	 *
	 * @remarks
	 * Packages that need their own tables — a cache store, a session store, a job
	 * queue — expose a `migrationSource()`, so an application opts in by listing
	 * it here instead of copying files it would then have to maintain. Each
	 * source carries a prefix, so a shipped migration can never collide with one
	 * of the application's.
	 *
	 * @example
	 * ```ts
	 * packageMigrations: [cacheMigrations(), sessionMigrations()]
	 * ```
	 *
	 * @defaultValue none, running only the application's own migrations
	 */
	packageMigrations?: readonly MigrationSource[]

	/** Directory holding seeder files. Resolved like {@link ConsoleOptions.migrations}. */
	seeders: string

	/**
	 * Database to run against.
	 *
	 * @defaultValue the environment-derived configuration from {@link configFromEnv}
	 */
	connection?: ConnectionConfig

	/**
	 * Name of the table tracking applied migrations.
	 *
	 * @defaultValue `"migrations"`
	 */
	migrationsTable?: string
}

const USAGE = `Usage: <command> [options]

Commands:
  migrate                 Run all pending migrations
  migrate:rollback        Reverse the last batch of migrations
  migrate:reset           Reverse every migration
  migrate:fresh           Drop all tables and migrate from scratch
  migrate:status          Show which migrations have run
  db:seed                 Run the database seeders

Options:
  --step=<n>              Batches to roll back (default: 1)
  --seed                  Seed after migrate:fresh
  --class=<Seeder>        Seeder class to run (default: DatabaseSeeder)
`

/** @internal */
function flag(argv: string[], name: string): string | undefined {
	const match = argv.find((argument) => argument.startsWith(`--${name}=`))
	return match?.slice(name.length + 3)
}

/** @internal */
function hasFlag(argv: string[], name: string): boolean {
	return argv.includes(`--${name}`)
}

/**
 * Entry point for an application's database CLI.
 *
 * @remarks
 * Applications wire this up with their own migration and seeder directories,
 * keeping the commands identical across every project in the monorepo.
 *
 * Recognised commands: `migrate`, `migrate:rollback` (`--step=<n>`),
 * `migrate:reset`, `migrate:fresh` (`--seed`), `migrate:status` and `db:seed`
 * (`--class=<Seeder>`). Passing nothing, `--help` or `-h` prints usage.
 *
 * The connection is always closed before returning, including on failure.
 * Errors are reported to stderr rather than thrown, so a caller only has to
 * forward the exit code.
 *
 * @param argv - Command and flags, i.e. `process.argv.slice(2)`.
 * @param options - Where migrations and seeders live, and what to connect to.
 * @returns A process exit code: `0` on success, `1` on a usage error or a
 * failed command.
 *
 * @example
 * ```ts
 * // apps/api/src/database/console.ts
 * process.exitCode = await runConsole(process.argv.slice(2), {
 *   migrations: new URL('./migrations', import.meta.url).pathname,
 *   seeders: new URL('./seeders', import.meta.url).pathname,
 * })
 * ```
 *
 * @public
 */
export async function run(argv: string[], options: ConsoleOptions): Promise<number> {
	const [command] = argv

	if (!command || command === '--help' || command === '-h') {
		console.log(USAGE)
		return command ? 0 : 1
	}

	const connection = await createConnection(options.connection)
	const migrator = new Migrator(connection, {
		// The application's own migrations come first so they keep the unprefixed
		// names already recorded in the tracking table; ordering within the run is
		// by filename regardless.
		path: [{ path: options.migrations }, ...(options.packageMigrations ?? [])],
		table: options.migrationsTable,
	})
	const seeders = new SeederRunner(connection, { path: options.seeders })

	try {
		switch (command) {
			case 'migrate':
				await migrator.run()
				break

			case 'migrate:rollback':
				await migrator.rollback(Number(flag(argv, 'step') ?? 1))
				break

			case 'migrate:reset':
				await migrator.reset()
				break

			case 'migrate:fresh':
				await migrator.fresh()
				if (hasFlag(argv, 'seed')) await seeders.run(flag(argv, 'class'))
				break

			case 'migrate:status': {
				const rows = await migrator.status()
				if (rows.length === 0) {
					console.log('No migrations found.')
					break
				}
				console.table(
					rows.map((row) => ({
						Migration: row.migration,
						Status: row.ran ? 'Ran' : 'Pending',
						Batch: row.batch ?? '',
					})),
				)
				break
			}

			case 'db:seed':
				await seeders.run(flag(argv, 'class'))
				break

			default:
				console.error(`Unknown command "${command}".\n`)
				console.log(USAGE)
				return 1
		}

		return 0
	} catch (error) {
		console.error(error instanceof Error ? error.message : error)
		return 1
	} finally {
		await connection.close()
	}
}
