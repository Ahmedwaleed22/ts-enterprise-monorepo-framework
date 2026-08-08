/**
 * Row types for the application, plus the guard that makes three hand-written
 * schema files safe to maintain.
 *
 * Drizzle's schema builders are per-dialect, so keeping all three databases
 * working means describing every table three times. The risk is drift: a column
 * added to one file and forgotten in another, or a type that quietly differs
 * (`integer` where the others give `boolean`). The assertions below turn that
 * class of mistake into a compile error rather than a runtime surprise on
 * whichever database is not the one you develop against.
 *
 * Postgres is the reference: `User`, `Post` and friends are inferred from
 * `schema.pg.ts`, and the other two must match it exactly.
 */
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import type * as mysql from "./schema.mysql.js";
import type * as pg from "./schema.pg.js";
import type * as sqlite from "./schema.sqlite.js";

/**
 * Invariant type equality — `A extends B` is too loose to catch widening.
 *
 * The two `T` parameters look unused, and a linter will say so; they are what
 * defers resolution so the compiler compares the types structurally rather than
 * assignably. This is the standard formulation.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Fails to compile unless the argument resolves to `true`. */
type Expect<T extends true> = T;

export type User = InferSelectModel<typeof pg.users>;
export type NewUser = InferInsertModel<typeof pg.users>;
export type Post = InferSelectModel<typeof pg.posts>;
export type NewPost = InferInsertModel<typeof pg.posts>;

/* eslint-disable @typescript-eslint/no-unused-vars -- assertions, not values. */
type _UserSelectMysql = Expect<Equals<User, InferSelectModel<typeof mysql.users>>>;
type _UserSelectSqlite = Expect<Equals<User, InferSelectModel<typeof sqlite.users>>>;
type _UserInsertMysql = Expect<Equals<NewUser, InferInsertModel<typeof mysql.users>>>;
type _UserInsertSqlite = Expect<Equals<NewUser, InferInsertModel<typeof sqlite.users>>>;

type _PostSelectMysql = Expect<Equals<Post, InferSelectModel<typeof mysql.posts>>>;
type _PostSelectSqlite = Expect<Equals<Post, InferSelectModel<typeof sqlite.posts>>>;
type _PostInsertMysql = Expect<Equals<NewPost, InferInsertModel<typeof mysql.posts>>>;
type _PostInsertSqlite = Expect<Equals<NewPost, InferInsertModel<typeof sqlite.posts>>>;
/* eslint-enable @typescript-eslint/no-unused-vars */
