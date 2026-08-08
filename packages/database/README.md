# @monorepo-framework/database

Laravel-style migrations and seeders that run unchanged on **Postgres, MySQL and sqlite**.

Migrations describe tables in dialect-neutral terms; a grammar compiles them to SQL
for whichever database is configured. Switching database means changing one env
var, not rewriting migrations.

The full API reference is generated from the source comments — see
[`docs/api`](../../docs/api/database.md), or [`docs/README.md`](../../docs/README.md)
for how the pipeline works.

## API stability

Every export carries a TSDoc release tag, enforced by API Extractor:

- **`@public`** — migrations, seeders, the schema builder, connections and
  configuration. The surface an application uses.
- **`@beta`** — the grammar extension point (`Grammar` and its subclasses,
  `grammarFor`, `ColumnAttributes`, `IndexDefinition`, `ForeignKeyDefinition`),
  whose protected surface grows as the builder learns more column modifiers; and
  the `ALTER TABLE` path (`Blueprint.dropColumn`, `Blueprint.dropIndex`,
  `Schema.rename`), which is thin and the least exercised across the three
  dialects.
- **`@internal`** — everything not re-exported from `src/index.ts`: the driver
  loader, the placeholder rewriter, the per-dialect connection factories. Use
  `createConnection` instead of reaching for those.

`etc/database.api.md` is the reviewed snapshot of that surface; a diff there
means the API changed. `etc/database.public.api.md` is the same with `@beta`
trimmed.

## Commands

Run from an app that wires up the console (see `apps/api/src/database/console.ts`):

```bash
pnpm db migrate                  # run pending migrations
pnpm db migrate:rollback         # reverse the last batch
pnpm db migrate:rollback --step=3
pnpm db migrate:reset            # reverse everything
pnpm db migrate:fresh --seed     # drop all tables, migrate, then seed
pnpm db migrate:status
pnpm db db:seed
pnpm db db:seed --class=UserSeeder
```

## Configuration

Defaults to a local sqlite file, so nothing needs installing to get started.

```bash
DB_CONNECTION=sqlite             # sqlite | postgres | mysql
DB_DATABASE=database/database.sqlite
```

Postgres and MySQL read the usual `DB_HOST` / `DB_PORT` / `DB_DATABASE` /
`DB_USERNAME` / `DB_PASSWORD`, or a single `DATABASE_URL` whose scheme implies
the dialect. See `apps/api/.env.example`.

Drivers are optional peer dependencies, imported lazily — install only what you
use: `pg` for Postgres, `mysql2` for MySQL. For sqlite the package prefers
`better-sqlite3` and falls back to Node's built-in `node:sqlite`, so sqlite needs
no dependency at all.

## Writing a migration

Files are timestamp-prefixed and applied in filename order.

```ts
import { Migration, type Schema } from "@monorepo-framework/database";

export default class CreateUsersTable extends Migration {
  async up(schema: Schema): Promise<void> {
    await schema.create("users", (table) => {
      table.id();                                  // portable auto-increment PK
      table.string("email").unique();
      table.string("role", 32).default("member");
      table.boolean("is_active").default(true);
      table.foreignId("team_id").constrained("teams");
      table.text("bio").nullable();
      table.timestamps();
      table.index(["team_id", "role"]);
    });
  }

  async down(schema: Schema): Promise<void> {
    await schema.dropIfExists("users");
  }
}
```

Available column types: `id`, `uuid`, `string`, `text`, `integer`, `bigInteger`,
`foreignId`, `boolean`, `float`, `decimal`, `date`, `timestamp`, `json`, plus the
`timestamps()` and `softDeletes()` helpers. Modifiers: `.nullable()`,
`.default()`, `.unique()`, `.index()`, `.primary()`, `.unsigned()`,
`.references()` / `.constrained()` with `.onDelete()` / `.onUpdate()`.

Use `raw()` for literal SQL defaults, and `schema.raw()` for DDL the builder does
not model.

## Writing a seeder

```ts
import { Seeder } from "@monorepo-framework/database";

export default class UserSeeder extends Seeder {
  async run(): Promise<void> {
    await this.truncate("users");
    await this.insert("users", [
      { id: 1, name: "Ada Lovelace", email: "ada@example.com" },
    ]);
  }
}
```

`insert` chunks large row sets to stay within parameter limits and resyncs
Postgres sequences when rows carry explicit ids, so seeding with fixed ids does
not break the next application insert. `DatabaseSeeder` is the entry point and
composes the rest via `this.call(...)`.

## Notes on portability

Behaviour that genuinely differs between databases is handled rather than hidden:

- Auto-increment keys use `bigserial` / `AUTO_INCREMENT` / `INTEGER PRIMARY KEY
  AUTOINCREMENT` as each dialect requires.
- Booleans become real booleans on Postgres and `1`/`0` elsewhere.
- Foreign keys are declared inside `CREATE TABLE`, because sqlite cannot add them
  afterwards.
- Columns are added one `ALTER TABLE` at a time, sqlite's limit.
- Migrations run in a transaction on Postgres and sqlite; MySQL commits
  implicitly on DDL, so it is not wrapped in one that would not hold.
- sqlite foreign key enforcement is switched on, which is off by default.
