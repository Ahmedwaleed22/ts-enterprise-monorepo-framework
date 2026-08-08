import { envString } from '@monorepo-framework/support'

import { Encrypter } from './encrypter.js'
import { generateKey, parseKey } from './key.js'

/**
 * Builds an {@link Encrypter} from the environment.
 *
 * @remarks
 * Reads `APP_KEY`. When it is missing the behaviour depends on `NODE_ENV`:
 * production refuses to start encrypting, and anything else warns and uses a key
 * generated for this process alone.
 *
 * A throwaway key is the honest development default. Deriving a *stable* key
 * from the project path or a checked-in seed would look more helpful, but it
 * means a secret nobody chose ends up in a container image that appears to work.
 * A random key fails visibly, in development, at the cheapest possible moment —
 * anything encrypted with it stops decrypting after a restart.
 *
 * The key is resolved lazily, on the first encrypt or decrypt. Importing an
 * application's service wiring in a job with no `APP_KEY` therefore does not
 * fail every unrelated test.
 *
 * @param env - The environment to read, injectable for tests.
 * @returns An encrypter bound to the configured key.
 *
 * @example
 * ```ts
 * const encrypter = encrypterFromEnv()
 * const payload = encrypter.encrypt({ userId: 7 })
 * ```
 *
 * @public
 */
export function encrypterFromEnv(env: NodeJS.ProcessEnv = process.env): Encrypter {
	return new Encrypter(() => {
		const key = envString(env, 'APP_KEY', '')
		if (key) return parseKey(key)

		if (envString(env, 'NODE_ENV', 'development') === 'production') {
			throw new Error(
				'APP_KEY is not set. Generate one with `pnpm key:generate --write`.',
			)
		}

		console.warn('APP_KEY is not set — using a throwaway key for this process only.')
		return parseKey(generateKey())
	})
}
