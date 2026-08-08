/**
 * Load a database driver that is declared as an optional peer dependency.
 *
 * Drivers are imported lazily so a project only installs the one database it
 * actually uses — importing this package never pulls in Postgres, MySQL and
 * sqlite at once.
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
