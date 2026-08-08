const RAW = Symbol('raw')

export interface RawExpression {
	readonly [RAW]: true
	readonly value: string
}

/**
 * Mark a value as literal SQL so it is emitted verbatim instead of being
 * quoted — e.g. `default(raw('CURRENT_TIMESTAMP'))`.
 */
export function raw(value: string): RawExpression {
	return { [RAW]: true, value }
}

export function isRaw(value: unknown): value is RawExpression {
	return typeof value === 'object' && value !== null && RAW in value
}
