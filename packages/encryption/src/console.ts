import { readFile, writeFile } from 'node:fs/promises'

import { generateKey } from './key.js'

const USAGE = `Usage: key:generate [options]

Commands:
  key:generate            Print a fresh application key

Options:
  --write                 Write the key into the env file instead of printing it
  --force                 Replace an APP_KEY that is already set
`

/** Matches an existing `APP_KEY=` line, whatever it is currently set to. */
const APP_KEY_LINE = /^APP_KEY=.*$/m

/**
 * Wiring an application supplies to {@link runConsole}.
 *
 * @public
 */
export interface ConsoleOptions {
	/**
	 * Env file `--write` updates.
	 *
	 * @remarks
	 * Resolved relative to the process working directory, so prefer an absolute
	 * path derived from `import.meta.url`.
	 */
	envFile: string
}

function hasFlag(argv: string[], name: string): boolean {
	return argv.includes(`--${name}`)
}

/**
 * Entry point for an application's key CLI.
 *
 * @remarks
 * Returns an exit code rather than calling `process.exit`, so the caller can
 * assign it to `process.exitCode` and let pending output flush.
 *
 * Rotating a key invalidates every encrypted cookie and every encrypted column,
 * so replacing one that already exists needs `--force`. That is a deliberate
 * act, not a default.
 *
 * @param argv - Arguments after the command name, i.e. `process.argv.slice(2)`.
 * @param options - Which env file to write to.
 * @returns The process exit code: `0` on success, `1` on failure.
 *
 * @example
 * ```ts
 * process.exitCode = await runConsole(process.argv.slice(2), {
 *   envFile: join(here, '..', '.env'),
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

	if (command !== 'key:generate') {
		console.error(`Unknown command "${command}".\n`)
		console.log(USAGE)
		return 1
	}

	const key = generateKey()

	if (!hasFlag(argv, 'write')) {
		console.log(key)
		return 0
	}

	try {
		await writeKey(options.envFile, key, hasFlag(argv, 'force'))
	} catch (error) {
		console.error(error instanceof Error ? error.message : error)
		return 1
	}

	console.log(`Application key set in ${options.envFile}`)
	return 0
}

async function writeKey(envFile: string, key: string, force: boolean): Promise<void> {
	// A missing env file is not an error — writing the key is how the first one
	// gets created.
	let contents = ''
	try {
		contents = await readFile(envFile, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
	}

	const existing = APP_KEY_LINE.exec(contents)?.[0]
	if (existing && existing !== 'APP_KEY=' && !force) {
		throw new Error(
			'APP_KEY is already set. Rotating it invalidates every encrypted cookie ' +
				'and column — pass `--force` if that is what you intend.',
		)
	}

	const updated = existing
		? contents.replace(APP_KEY_LINE, `APP_KEY=${key}`)
		: appendKey(contents, key)

	await writeFile(envFile, updated, 'utf8')
}

function appendKey(contents: string, key: string): string {
	if (!contents) return `APP_KEY=${key}\n`
	return contents.endsWith('\n')
		? `${contents}APP_KEY=${key}\n`
		: `${contents}\nAPP_KEY=${key}\n`
}
