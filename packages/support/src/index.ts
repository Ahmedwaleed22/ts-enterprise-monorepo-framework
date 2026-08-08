/**
 * Shared primitives every framework package builds on.
 *
 * @remarks
 * This package is deliberately inert: it imports nothing, declares no peer
 * dependency and performs no I/O. That rule is what keeps it from becoming the
 * junk drawer every monorepo eventually grows — anything needing a socket, a
 * file handle or a third-party module belongs in the package that owns it.
 *
 * It supplies three things:
 *
 * - {@link loadDriver}, for importing an optional peer dependency lazily and
 *   failing with an install hint rather than a stack trace.
 * - {@link envString}, {@link envBoolean}, {@link envNumber} and
 *   {@link envChoice}, the vocabulary every package's `configFromEnv` is written
 *   in.
 * - {@link Manager}, the driver-resolution base class that gives every package
 *   the same shape: free construction, lazy resolution, one instance per name.
 *
 * @packageDocumentation
 */

export { loadDriver } from './driver.js'

export { envBoolean, envChoice, envNumber, envString } from './env.js'

export { Manager } from './manager.js'
export type { DriverFactory } from './manager.js'

export { silent, systemClock } from './runtime.js'
export type { Clock, Closable, Output } from './runtime.js'
