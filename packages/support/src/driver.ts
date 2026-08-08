/**
 * Loads a driver that is declared as an optional peer dependency.
 *
 * @remarks
 * Drivers are imported lazily so a project installs only the backend it actually
 * uses — importing a framework package never pulls in Redis, Postgres and an
 * SMTP client at once.
 *
 * Only a genuine "module not found" becomes the friendly install hint. A driver
 * that exists but fails to initialise is rethrown untouched, so a native module
 * built against the wrong ABI reports its own problem instead of being
 * misdiagnosed as missing.
 *
 * @typeParam T - The driver module's shape, declared by the caller so the
 * framework never needs the driver's own typings at build time.
 * @param specifier - Module specifier to import, such as `ioredis` or
 * `mysql2/promise`.
 * @param installHint - What to tell the developer to install. Not always the
 * specifier: `mysql2/promise` is installed as `mysql2`.
 * @returns The imported module, typed as `T`.
 * @throws Error naming the install command when the module is not installed.
 *
 * @example
 * ```ts
 * interface RedisModule {
 *   default: new (url: string) => { get(key: string): Promise<string | null> }
 * }
 *
 * const module = await loadDriver<RedisModule>('ioredis', 'ioredis')
 * const client = new module.default('redis://127.0.0.1:6379')
 * ```
 *
 * @public
 */
export async function loadDriver<T>(specifier: string, installHint: string): Promise<T> {
	try {
		return (await import(specifier)) as T
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | undefined)?.code
		if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
			throw new Error(
				`The "${specifier}" driver is required for this connection but is not installed. ` +
					`Install it with \`pnpm add ${installHint}\`.`,
				{ cause: error },
			)
		}
		// The module exists but failed to initialise — surface the real problem.
		throw error
	}
}
