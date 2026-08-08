/**
 * Brand distinguishing a {@link RawExpression} from a plain `{ value: string }`.
 *
 * @remarks
 * Exported only because the declaration of {@link RawExpression} references it;
 * it is not part of the supported surface and may be renamed or removed at any
 * time. Build raw expressions with {@link raw}.
 *
 * @internal
 */
export const RAW: unique symbol = Symbol('raw')

/**
 * A fragment of literal SQL that is emitted verbatim rather than quoted.
 *
 * @remarks
 * Created by {@link raw}, and accepted anywhere a value would be — most often a
 * column default. Because the contents bypass quoting entirely, never build one
 * from user input.
 *
 * @public
 */
export interface RawExpression {
	/**
	 * Brand only; not meaningful at runtime.
	 *
	 * @internal
	 */
	readonly [RAW]: true
	/** The SQL text, emitted exactly as written. */
	readonly value: string
}

/**
 * Mark a value as literal SQL so it is emitted verbatim instead of being quoted.
 *
 * @param value - SQL text, e.g. `"CURRENT_TIMESTAMP"`. Interpolating untrusted
 * input here is an injection vector — the text is not escaped.
 * @returns An expression the grammars emit as-is.
 *
 * @example
 * ```ts
 * table.timestamp('created_at').default(raw('CURRENT_TIMESTAMP'))
 * ```
 *
 * @public
 */
export function raw(value: string): RawExpression {
	return { [RAW]: true, value }
}

/**
 * Narrow an unknown value to a {@link RawExpression}.
 *
 * @internal
 */
export function isRaw(value: unknown): value is RawExpression {
	return typeof value === 'object' && value !== null && RAW in value
}
