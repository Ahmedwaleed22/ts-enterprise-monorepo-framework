/**
 * Reads the current time as epoch milliseconds.
 *
 * @remarks
 * Every package that expires something — cache entries, sessions, delayed jobs —
 * takes one of these rather than calling `Date.now()` directly, so a test can
 * move time forward instead of sleeping through it.
 *
 * @example
 * ```ts
 * let now = 0
 * const clock: Clock = () => now
 *
 * const cache = new Cache({ clock })
 * await cache.put('key', 'value', 60_000)
 *
 * now += 60_001
 * await cache.get('key') // undefined, without waiting a minute
 * ```
 *
 * @public
 */
export type Clock = () => number

/**
 * The default {@link Clock}, reading the system time.
 *
 * @public
 */
export const systemClock: Clock = () => Date.now()

/**
 * Where a long-running operation reports progress, one line at a time.
 *
 * @remarks
 * Named `Output` rather than `Logger` so it never reads as the `log` package's
 * levelled logger. This is a single line of human-readable text — a migration
 * name, a processed job — not a structured record.
 *
 * @public
 */
export type Output = (message: string) => void

/**
 * An {@link Output} that discards everything written to it.
 *
 * @remarks
 * Passed by tests so a suite that exercises a migrator or a queue worker does
 * not bury its own assertions in progress chatter.
 *
 * @public
 */
export const silent: Output = () => undefined

/**
 * A resource that holds something open — a socket, a file handle, a pool.
 *
 * @remarks
 * {@link Manager.close} probes each resolved driver for this shape, so a driver
 * that owns no resources simply omits `close` rather than implementing an empty
 * one.
 *
 * @public
 */
export interface Closable {
	/**
	 * Releases the underlying resources.
	 *
	 * @returns Nothing, or a promise that settles once the release finishes.
	 */
	close(): Promise<void> | void
}
