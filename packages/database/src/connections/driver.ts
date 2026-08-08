/**
 * Load a database driver that is declared as an optional peer dependency.
 *
 * @remarks
 * Drivers are imported lazily so a project only installs the one database it
 * actually uses — importing this package never pulls in Postgres, MySQL and
 * sqlite at once.
 *
 * A missing module is translated into an actionable message; any other failure
 * is rethrown untouched, so a driver that is installed but broken does not get
 * misreported as absent.
 *
 * @param specifier - Module to import, e.g. `"pg"`.
 * @param installHint - What to tell the user to install, e.g. `"pg @types/pg"`.
 * @returns The imported module namespace.
 * @throws Error naming the package to install, when the module is not found.
 *
 * @internal
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
