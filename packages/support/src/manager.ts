import type { Closable } from './runtime.js'

/**
 * Builds a driver from the context its manager resolved at construction.
 *
 * @remarks
 * Factories may be synchronous. A memory store has nothing to await, and forcing
 * it to return a promise would make the simplest driver the most awkward to
 * write.
 *
 * @typeParam TDriver - The contract every driver in the package satisfies.
 * @typeParam TContext - Whatever the package resolved once and shares with all
 * of its drivers, typically its config plus a clock or a connection.
 *
 * @public
 */
export type DriverFactory<TDriver, TContext> = (
	context: TContext,
) => TDriver | Promise<TDriver>

/**
 * Resolves a named driver and remembers it.
 *
 * @remarks
 * Construction is free: nothing connects, opens a file or reads a table until
 * the first {@link Manager.driver} call. That is what lets an application
 * declare every service as a plain module-level constant without paying for the
 * ones a given request never touches.
 *
 * Subclasses are also the package's public face — they expose explicit, typed
 * methods that delegate to the resolved driver. There is no dynamic dispatch,
 * because the TypeScript equivalent returns `any` and loses go-to-definition.
 *
 * @typeParam TDriver - The contract every driver in the package satisfies.
 * @typeParam TContext - The shared context handed to each driver factory.
 *
 * @example
 * ```ts
 * class Cache extends Manager<Store, StoreContext> {
 *   constructor(options: CacheOptions = {}) {
 *     const config = options.config ?? configFromEnv()
 *     super({ config, clock: options.clock ?? systemClock }, config.store)
 *   }
 *
 *   protected factories() {
 *     return { memory: createMemoryStore, redis: createRedisStore }
 *   }
 * }
 * ```
 *
 * @public
 */
export abstract class Manager<TDriver, TContext> {
	// The *promise* is cached rather than the driver, so two concurrent first
	// calls share one connection instead of racing to open two.
	private readonly resolved = new Map<string, Promise<TDriver>>()

	private readonly custom = new Map<string, DriverFactory<TDriver, TContext>>()

	/**
	 * @param context - Shared state handed to every driver factory.
	 * @param fallback - Driver name used when {@link Manager.driver} is called
	 * with no argument, normally the one the package's config resolved.
	 */
	protected constructor(
		/** Shared state handed to every driver factory, readable by subclasses. */
		protected readonly context: TContext,
		private readonly fallback: string,
	) {}

	/**
	 * The drivers this package ships, keyed by the name its config accepts.
	 *
	 * @remarks
	 * Values are typed as possibly `undefined` so an unknown name is a miss the
	 * lookup has to handle rather than a trusted hit.
	 *
	 * @returns The built-in driver factories.
	 *
	 * @virtual
	 */
	protected abstract factories(): Record<
		string,
		DriverFactory<TDriver, TContext> | undefined
	>

	/**
	 * Resolves a driver by name, building it on first use.
	 *
	 * @param name - Driver to resolve. Defaults to the configured one.
	 * @returns The driver, shared with every other caller asking for this name.
	 * @throws Error listing the supported names when `name` matches no driver.
	 */
	driver(name: string = this.fallback): Promise<TDriver> {
		const cached = this.resolved.get(name)
		if (cached) return cached

		const pending = this.build(name)
		this.resolved.set(name, pending)
		// A driver that failed to start must not be remembered, or one refused
		// connection would keep failing for the life of the process.
		void pending.catch(() => this.resolved.delete(name))
		return pending
	}

	/**
	 * Registers a driver of your own, or replaces one of the built-ins.
	 *
	 * @remarks
	 * Any instance already resolved under this name is discarded, so the next
	 * call builds from the new factory. It is not closed — whoever supplied the
	 * replacement owns the old one.
	 *
	 * @param name - Name the new driver answers to.
	 * @param factory - Builds the driver from the shared context.
	 * @returns This manager, for chaining.
	 *
	 * @example
	 * ```ts
	 * cache.extend('tiered', (context) => createTieredStore(context))
	 * ```
	 */
	extend(name: string, factory: DriverFactory<TDriver, TContext>): this {
		this.custom.set(name, factory)
		this.resolved.delete(name)
		return this
	}

	/**
	 * Releases every driver that was actually resolved.
	 *
	 * @remarks
	 * Drivers that were never built are skipped, so closing a manager nobody used
	 * costs nothing and never opens a connection just to shut it again. A driver
	 * that failed to start has nothing to release and is ignored.
	 *
	 * @returns A promise that settles once every resolved driver is closed.
	 */
	async close(): Promise<void> {
		const pending = [...this.resolved.values()]
		this.resolved.clear()

		for (const result of await Promise.allSettled(pending)) {
			// A driver that never finished starting holds nothing open.
			if (result.status !== 'fulfilled') continue
			if (isClosable(result.value)) await result.value.close()
		}
	}

	private async build(name: string): Promise<TDriver> {
		const factory = this.custom.get(name) ?? this.factories()[name]
		if (!factory) {
			const supported = [
				...new Set([...Object.keys(this.factories()), ...this.custom.keys()]),
			].join(', ')
			throw new Error(`Unsupported driver "${name}". Supported: ${supported}.`)
		}

		return factory(this.context)
	}
}

function isClosable(value: unknown): value is Closable {
	if (typeof value !== 'object' || value === null || !('close' in value)) return false
	return typeof value.close === 'function'
}
