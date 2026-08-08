import { createConnection } from './connections/index.js'
import { Migrator } from './migrations/migrator.js'
import { SeederRunner } from './seeders/runner.js'
import type { ConnectionConfig } from './types.js'

export interface ConsoleOptions {
	/** Directory holding migration files. */
	migrations: string
	/** Directory holding seeder files. */
	seeders: string
	/** Defaults to the environment-derived configuration. */
	connection?: ConnectionConfig
	/** Name of the table tracking applied migrations. */
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

function flag(argv: string[], name: string): string | undefined {
	const match = argv.find((argument) => argument.startsWith(`--${name}=`))
	return match?.slice(name.length + 3)
}

function hasFlag(argv: string[], name: string): boolean {
	return argv.includes(`--${name}`)
}

/**
 * Entry point for an application's database CLI.
 *
 * Applications wire this up with their own migration and seeder directories,
 * keeping the commands identical across every project in the monorepo.
 */
export async function run(argv: string[], options: ConsoleOptions): Promise<number> {
	const [command] = argv

	if (!command || command === '--help' || command === '-h') {
		console.log(USAGE)
		return command ? 0 : 1
	}

	const connection = await createConnection(options.connection)
	const migrator = new Migrator(connection, {
		path: options.migrations,
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
