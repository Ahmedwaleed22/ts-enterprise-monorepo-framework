/**
 * Application-key encryption and signing.
 *
 * @remarks
 * One secret — `APP_KEY` — backs two operations:
 *
 * - {@link Encrypter.encrypt} hides a value with AES-256-GCM, for anything the
 *   client must not read.
 * - {@link Encrypter.sign} authenticates a value the client *may* read but must
 *   not change, such as a session id in a cookie.
 *
 * The two use keys derived from `APP_KEY` under different labels, so a signature
 * can never be used against the cipher or vice versa. There is still only one
 * secret to rotate.
 *
 * Generate a key with the CLI this package's {@link run} powers:
 *
 * ```bash
 * pnpm key:generate --write
 * ```
 *
 * @packageDocumentation
 */

export { encrypterFromEnv } from './config.js'

export { run as runConsole } from './console.js'
export type { ConsoleOptions } from './console.js'

export { Encrypter } from './encrypter.js'
export type { KeyProvider } from './encrypter.js'

export { deriveKey, generateKey, parseKey } from './key.js'
