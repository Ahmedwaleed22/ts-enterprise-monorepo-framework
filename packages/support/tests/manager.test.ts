import { describe, expect, test } from 'vitest'

import { Manager } from '../src/manager.js'
import type { DriverFactory } from '../src/manager.js'

interface Widget {
	name: string
	closed: boolean
	close(): Promise<void>
}

interface Context {
	built: string[]
}

function widget(name: string): Widget {
	return {
		name,
		closed: false,
		// eslint-disable-next-line @typescript-eslint/require-await
		async close() {
			this.closed = true
		},
	}
}

class Widgets extends Manager<Widget, Context> {
	constructor(
		context: Context = { built: [] },
		fallback = 'alpha',
		private readonly onBuild?: (name: string) => Widget | Promise<Widget>,
	) {
		super(context, fallback)
	}

	protected factories(): Record<string, DriverFactory<Widget, Context> | undefined> {
		const build = (name: string): DriverFactory<Widget, Context> => {
			return (context) => {
				context.built.push(name)
				return this.onBuild ? this.onBuild(name) : widget(name)
			}
		}

		return { alpha: build('alpha'), beta: build('beta') }
	}
}

describe('resolving drivers', () => {
	test('builds the configured driver when called with no name', async () => {
		const manager = new Widgets()
		expect((await manager.driver()).name).toBe('alpha')
	})

	test('builds a named driver on request', async () => {
		const manager = new Widgets()
		expect((await manager.driver('beta')).name).toBe('beta')
	})

	test('builds each driver once and shares it', async () => {
		const context: Context = { built: [] }
		const manager = new Widgets(context)

		const first = await manager.driver()
		const second = await manager.driver()

		expect(first).toBe(second)
		expect(context.built).toEqual(['alpha'])
	})

	test('concurrent first calls share one instance', async () => {
		// The promise is cached rather than the driver, so two callers racing to
		// resolve open one connection between them instead of two.
		const context: Context = { built: [] }
		const manager = new Widgets(context)

		const [first, second] = await Promise.all([manager.driver(), manager.driver()])

		expect(first).toBe(second)
		expect(context.built).toEqual(['alpha'])
	})

	test('rejects an unknown driver and lists what is supported', async () => {
		const manager = new Widgets()
		await expect(manager.driver('gamma')).rejects.toThrow(
			'Unsupported driver "gamma". Supported: alpha, beta.',
		)
	})

	test('does not remember a driver that failed to start', async () => {
		// One refused connection must not poison the name for the life of the
		// process — the next call has to be allowed to try again.
		let attempts = 0
		const manager = new Widgets({ built: [] }, 'alpha', (name) => {
			attempts += 1
			if (attempts === 1) throw new Error('connection refused')
			return widget(name)
		})

		await expect(manager.driver()).rejects.toThrow('connection refused')
		expect((await manager.driver()).name).toBe('alpha')
		expect(attempts).toBe(2)
	})
})

describe('extending', () => {
	test('registers a driver of your own', async () => {
		const manager = new Widgets()
		manager.extend('custom', () => widget('custom'))

		expect((await manager.driver('custom')).name).toBe('custom')
	})

	test('replaces a built-in of the same name', async () => {
		const manager = new Widgets()
		manager.extend('alpha', () => widget('replaced'))

		expect((await manager.driver('alpha')).name).toBe('replaced')
	})

	test('discards an instance already resolved under that name', async () => {
		const manager = new Widgets()
		const original = await manager.driver('alpha')

		manager.extend('alpha', () => widget('replaced'))

		expect((await manager.driver('alpha')).name).toBe('replaced')
		// The old instance is the caller's to dispose of, so it stays open.
		expect(original.closed).toBe(false)
	})

	test('lists custom drivers in the unsupported-driver error', async () => {
		const manager = new Widgets()
		manager.extend('custom', () => widget('custom'))

		await expect(manager.driver('gamma')).rejects.toThrow(
			'Supported: alpha, beta, custom.',
		)
	})
})

describe('closing', () => {
	test('closes every resolved driver', async () => {
		const manager = new Widgets()
		const alpha = await manager.driver('alpha')
		const beta = await manager.driver('beta')

		await manager.close()

		expect(alpha.closed).toBe(true)
		expect(beta.closed).toBe(true)
	})

	test('builds nothing that was never used', async () => {
		const context: Context = { built: [] }
		const manager = new Widgets(context)

		await manager.close()

		expect(context.built).toEqual([])
	})

	test('resolves again after closing', async () => {
		const context: Context = { built: [] }
		const manager = new Widgets(context)

		await manager.driver()
		await manager.close()
		await manager.driver()

		expect(context.built).toEqual(['alpha', 'alpha'])
	})

	test('ignores a driver that failed to start', async () => {
		const manager = new Widgets({ built: [] }, 'alpha', () => {
			throw new Error('connection refused')
		})

		await expect(manager.driver()).rejects.toThrow('connection refused')
		await expect(manager.close()).resolves.toBeUndefined()
	})

	test('tolerates a driver with nothing to release', async () => {
		class Plain extends Manager<{ name: string }, Context> {
			constructor() {
				super({ built: [] }, 'only')
			}

			protected factories(): Record<
				string,
				DriverFactory<{ name: string }, Context> | undefined
			> {
				return { only: () => ({ name: 'only' }) }
			}
		}

		const manager = new Plain()
		await manager.driver()

		await expect(manager.close()).resolves.toBeUndefined()
	})
})
