/**
 * Reads a string setting, treating blank as unset.
 *
 * @remarks
 * A `.env` line left as `KEY=` falls back to the default rather than silently
 * configuring an empty string — an empty host or table name fails much further
 * from its cause.
 *
 * @param env - The environment to read, injectable so tests need not mutate
 * `process.env`.
 * @param key - Variable name to read.
 * @param fallback - Value to use when the variable is unset or blank.
 * @returns The trimmed value, or `fallback`.
 *
 * @example
 * ```ts
 * envString(process.env, 'CACHE_PREFIX', 'cache')
 * ```
 *
 * @public
 */
export function envString(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
	const value = env[key]?.trim()
	return value ? value : fallback
}

/**
 * Reads a boolean setting.
 *
 * @remarks
 * Accepts `true` and `1` as true and anything else as false, so the common
 * spellings both work. Comparison is case-insensitive.
 *
 * @param env - The environment to read.
 * @param key - Variable name to read.
 * @param fallback - Value to use when the variable is unset or blank.
 * @returns The parsed boolean, or `fallback`.
 *
 * @example
 * ```ts
 * envBoolean(process.env, 'DB_SSL') // false unless DB_SSL=true or DB_SSL=1
 * ```
 *
 * @public
 */
export function envBoolean(
	env: NodeJS.ProcessEnv,
	key: string,
	fallback = false,
): boolean {
	const value = env[key]?.trim().toLowerCase()
	if (!value) return fallback
	return value === 'true' || value === '1'
}

/**
 * Reads a numeric setting, refusing values that are not numbers.
 *
 * @remarks
 * Throwing beats letting `NaN` reach a driver, where it surfaces later as a
 * confusing connection or timeout error that names neither the variable nor the
 * value that caused it.
 *
 * @param env - The environment to read.
 * @param key - Variable name to read.
 * @param fallback - Value to use when the variable is unset or blank.
 * @returns The parsed number, or `fallback`.
 * @throws Error naming the variable and the offending value when it will not
 * parse as a number.
 *
 * @example
 * ```ts
 * envNumber(process.env, 'DB_PORT', 5432)
 * ```
 *
 * @public
 */
export function envNumber(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
	const value = env[key]?.trim()
	if (!value) return fallback

	const parsed = Number(value)
	if (Number.isNaN(parsed)) throw new Error(`${key} must be a number, got "${value}".`)
	return parsed
}

/**
 * Resolves one of a fixed set of choices, accepting aliases.
 *
 * @remarks
 * The alias map is typed with `undefined` in the value so an unknown key is a
 * miss the caller has to handle rather than a silently-trusted lookup. Aliases
 * let one concept answer to several spellings — `array` and `memory` naming the
 * same cache store, say — without the caller branching.
 *
 * @typeParam T - The union of valid choices.
 * @param env - The environment to read.
 * @param key - Variable name to read.
 * @param aliases - Accepted spellings mapped to the choice each resolves to.
 * Keys must be lowercase.
 * @param fallback - Choice to use when the variable is unset or blank.
 * @returns The resolved choice, or `fallback`.
 * @throws Error listing the accepted spellings when the value matches none.
 *
 * @example
 * ```ts
 * const STORE_ALIASES: Record<string, StoreName | undefined> = {
 *   memory: 'memory',
 *   array: 'memory',
 *   redis: 'redis',
 * }
 *
 * envChoice(process.env, 'CACHE_STORE', STORE_ALIASES, 'memory')
 * ```
 *
 * @public
 */
export function envChoice<T extends string>(
	env: NodeJS.ProcessEnv,
	key: string,
	aliases: Record<string, T | undefined>,
	fallback: T,
): T {
	const value = env[key]?.trim().toLowerCase()
	if (!value) return fallback

	const choice = aliases[value]
	if (!choice) {
		const supported = Object.keys(aliases).join(', ')
		throw new Error(`Unsupported value "${value}" for ${key}. Supported: ${supported}.`)
	}
	return choice
}
