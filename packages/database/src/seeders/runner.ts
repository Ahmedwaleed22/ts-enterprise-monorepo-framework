import { readdir } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Seeder } from './seeder.js'
import type { SeederConstructor } from './seeder.js'
import type { Connection } from '../types.js'

const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.js', '.mjs'])

/**
 * Construction options for {@link SeederRunner}.
 *
 * @public
 */
export interface SeederRunnerOptions {
	/** Directory holding the seeder files, resolved against the working directory. */
	path: string

	/**
	 * Seeder run when none is named, mirroring Laravel's entry point.
	 *
	 * @defaultValue `"DatabaseSeeder"`
	 */
	defaultSeeder?: string

	/**
	 * Where progress is reported. Pass a noop logger to silence output.
	 *
	 * @defaultValue `console.log`
	 */
	logger?: (message: string) => void
}

/**
 * Loads a seeder class by name and runs it against the given connection.
 *
 * @remarks
 * A seeder is found by filename, so `"UserSeeder"` loads `UserSeeder.ts` (or
 * `.mts` / `.js` / `.mjs`) from the configured directory. Files are imported
 * dynamically, so a `.ts` seeder needs a loader such as `tsx` in the running
 * process.
 *
 * Nothing is tracked between runs — seeding twice inserts twice.
 *
 * @example
 * ```ts
 * const seeders = new SeederRunner(connection, { path: './src/database/seeders' })
 * await seeders.run()             // DatabaseSeeder
 * await seeders.run('UserSeeder') // just this one
 * ```
 *
 * @public
 */
export class SeederRunner {
	private readonly directory: string
	private readonly defaultSeeder: string
	private readonly log: (message: string) => void

	/**
	 * @param connection - Database to seed.
	 * @param options - Where the seeders live, and how to report progress.
	 */
	constructor(
		private readonly connection: Connection,
		options: SeederRunnerOptions,
	) {
		this.directory = resolve(options.path)
		this.defaultSeeder = options.defaultSeeder ?? 'DatabaseSeeder'
		this.log = options.logger ?? ((message) => { console.log(message) })
	}

	/**
	 * Load a seeder and run it.
	 *
	 * @param name - Seeder class name, matching its filename.
	 * @throws Error if the directory does not exist, no file matches the name,
	 * or the file's default export is not a class extending {@link Seeder}.
	 */
	async run(name = this.defaultSeeder): Promise<void> {
		const Constructor = await this.resolve(name)
		this.log(`Seeding: ${name}`)
		const seeder = new Constructor(this.connection)
		await seeder.run()
		this.log('Database seeding completed successfully.')
	}

	private async resolve(name: string): Promise<SeederConstructor> {
		const file = await this.fileFor(name)
		const module = (await import(pathToFileURL(file).href)) as {
			default?: SeederConstructor
		}

		const Constructor = module.default
		if (typeof Constructor !== 'function' || !(Constructor.prototype instanceof Seeder)) {
			throw new Error(`Seeder "${name}" must default-export a class extending Seeder.`)
		}

		return Constructor
	}

	private async fileFor(name: string): Promise<string> {
		let entries: string[]
		try {
			entries = await readdir(this.directory)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				throw new Error(`Seeder directory ${this.directory} does not exist.`, { cause: error })
			}
			throw error
		}

		const match = entries.find(
			(entry) => basename(entry, extname(entry)) === name && SOURCE_EXTENSIONS.has(extname(entry)),
		)

		if (!match) {
			throw new Error(`Seeder "${name}" was not found in ${this.directory}.`)
		}

		return join(this.directory, match)
	}
}
