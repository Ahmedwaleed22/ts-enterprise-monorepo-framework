/**
 * Base class for API resources — the transformation layer between a database
 * row and the JSON a client sees, mirroring Laravel's `JsonResource`.
 *
 * A resource owns the shape of a response. Controllers fetch whole rows and
 * hand them here; nothing decides what is public except the resource itself,
 * so a column added to a migration does not silently appear in an API payload.
 *
 * `toJSON` delegates to `toArray`, so a resource can be handed straight to
 * `res.json()` — `JSON.stringify` picks it up with no extra call.
 *
 * @example
 * ```ts
 * res.status(200).json({ data: UserResource.collection(rows) })
 * ```
 */
export abstract class JsonResource<TModel, TShape extends object> {
  constructor(
    /** The row being transformed. Named as in Laravel, where it is `$this->resource`. */
    protected readonly resource: TModel,
  ) {}

  /** The public representation of {@link JsonResource.resource}. */
  abstract toArray(): TShape;

  toJSON(): TShape {
    return this.toArray();
  }

  /**
   * Wrap a single row.
   *
   * The `this` parameter types the call against the *subclass* constructor, so
   * `UserResource.make(row)` requires a `User` and returns a `UserResource`
   * without either being restated.
   */
  static make<TModel, TResource extends JsonResource<TModel, object>>(
    this: new (resource: TModel) => TResource,
    resource: TModel,
  ): TResource {
    return new this(resource);
  }

  /** Wrap a result set. */
  static collection<TModel, TResource extends JsonResource<TModel, object>>(
    this: new (resource: TModel) => TResource,
    resources: readonly TModel[],
  ): TResource[] {
    return resources.map((item) => new this(item));
  }
}
