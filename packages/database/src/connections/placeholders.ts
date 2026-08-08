/**
 * Rewrite portable `?` placeholders to Postgres' positional `$1`, `$2` form.
 *
 * Question marks inside string literals are left alone, so seed data
 * containing prose (`'Is it working?'`) survives the rewrite intact.
 */
export function toPositionalPlaceholders(query: string): string {
	let result = ''
	let position = 0
	let quote: string | undefined

	for (let index = 0; index < query.length; index += 1) {
		const character = query[index]

		if (quote) {
			result += character
			if (character === quote) {
				// A doubled quote is an escaped quote, not the end of the literal.
				if (query[index + 1] === quote) {
					index += 1
					result += quote
				} else {
					quote = undefined
				}
			}
			continue
		}

		if (character === "'" || character === '"') {
			quote = character
			result += character
			continue
		}

		if (character === '?') {
			position += 1
			result += `$${position}`
			continue
		}

		result += character
	}

	return result
}
