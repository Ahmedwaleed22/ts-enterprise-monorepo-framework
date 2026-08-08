# @monorepo-framework/support

The primitives every other framework package is built from — **driver loading, environment
parsing and driver resolution**.

Nothing here is a feature in its own right. It exists so that thirteen packages resolve
their drivers the same way, read their configuration the same way, and fail with the same
kind of message when something is missing.

## The rule

**This package imports nothing, declares no peer dependency, and performs no I/O.**

That constraint is the whole design. A shared package with no rule about what belongs in it
becomes the junk drawer every monorepo eventually grows. If a thing needs a socket, a file
handle or a third-party module, it belongs in the package that owns it — not here.

## Loading an optional driver

Drivers are optional peer dependencies so a project installs only the backend it uses.
`loadDriver` imports one lazily and turns a missing module into an instruction:

```ts
import { loadDriver } from "@monorepo-framework/support";

interface RedisModule {
  default: new (url: string) => RedisClient;
}

const module = await loadDriver<RedisModule>("ioredis", "ioredis");
```

If `ioredis` is not installed the developer gets

```
The "ioredis" driver is required for this connection but is not installed.
Install it with `pnpm add ioredis`.
```

The caller declares the module's shape, so the framework never needs the driver's own
typings at build time. The install hint is a separate argument because it is not always the
specifier — `mysql2/promise` is installed as `mysql2`.

Only a genuine "module not found" is rewritten. A driver that exists but fails to
initialise — a native module built against the wrong ABI, say — is rethrown untouched, so
it reports its own problem rather than being misdiagnosed as missing.

## Reading configuration

Every package's `configFromEnv` is written in this vocabulary:

```ts
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): CacheConfig {
  return {
    store: envChoice(env, "CACHE_STORE", STORE_ALIASES, "memory"),
    prefix: envString(env, "CACHE_PREFIX", "cache"),
    ttl: envNumber(env, "CACHE_TTL", 0),
  };
}
```

`env` is a parameter with a default rather than a direct `process.env` read, so a test
configures a package by passing an object instead of mutating global state.

Three behaviours are worth knowing:

- **Blank counts as unset.** A `.env` line left as `KEY=` falls back to the default rather
  than configuring the empty string. An empty host or table name fails a long way from its
  cause.
- **`envNumber` throws** on a value that will not parse. Letting `NaN` through surfaces
  later as a connection or timeout error naming neither the variable nor the value.
- **`envChoice` takes an alias map** typed `Record<string, T | undefined>`. The `undefined`
  is deliberate: it makes an unknown key a miss the caller has to handle instead of a
  silently-trusted lookup.

## Resolving drivers

`Manager` is the base class behind `Cache`, `Mailer`, `SessionManager` and the rest. It
gives all of them the same three properties:

```ts
class Cache extends Manager<Store, StoreContext> {
  constructor(options: CacheOptions = {}) {
    const config = options.config ?? configFromEnv();
    super({ config, clock: options.clock ?? systemClock }, config.store);
  }

  protected factories() {
    return { memory: createMemoryStore, redis: createRedisStore };
  }
}
```

**Construction is free.** Nothing connects, opens a file or reads a table until the first
`driver()` call. That is what lets an application declare every service as a plain
module-level constant — an app that never queues a job never talks to Redis.

**One instance per name.** `driver()` caches the *promise*, not the driver, so two
concurrent first calls share one connection instead of racing to open two.

**A failure is not remembered.** A driver that throws while starting is evicted from the
cache, so one refused connection does not keep failing for the life of the process.

`extend(name, factory)` registers a driver of your own or replaces a built-in.
`close()` releases every driver that was actually resolved and skips the rest, so closing a
manager nobody used costs nothing.

## Testing against a clock

Anything that expires — cache entries, sessions, delayed jobs — takes a `Clock` rather than
calling `Date.now()`, so a test moves time instead of sleeping through it:

```ts
let now = 0;
const cache = new Cache({ clock: () => now });

await cache.put("key", "value", 60_000);
now += 60_001;
await cache.get("key"); // undefined
```

`Output` and `silent` play the same role for progress reporting: a migrator or a queue
worker writes one line per step, and a test passes `silent` so the suite does not bury its
assertions in chatter. `Output` is named that way rather than `Logger` so it never reads as
the `log` package's levelled logger — it is one line of human-readable text, not a
structured record.
