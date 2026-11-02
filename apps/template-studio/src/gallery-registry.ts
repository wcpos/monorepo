type GalleryValue = string | number | boolean | null;
type GalleryEntry = Record<string, GalleryValue>;

/** Read literal registry metadata without executing PHP; nested preview arrays are ignored. */
export function parseGalleryRegistry(source: string): Record<string, GalleryEntry> {
	// Tokenize strings before punctuation so escaped quotes, comments and parentheses
	// inside translated copy cannot terminate an entry.
	const tokens = (
		source.match(
			/'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|=>|-?\d+|[a-zA-Z_]\w*|[^\s]/g
		) ?? []
	).filter((token) => !/^(\/\*|\/\/|#)/.test(token));
	const isString = (token: string | undefined): token is string =>
		token !== undefined && (token.startsWith("'") || token.startsWith('"'));
	const unquote = (token: string) =>
		token
			.slice(1, -1)
			.replace(/\\([\\'"])/g, (escape, char: string) =>
				char === '\\' || char === token[0] ? char : escape
			);
	const endOfGroup = (start: number): number => {
		const stack = [tokens[start] === '(' ? ')' : ']'];
		for (let index = start + 1; index < tokens.length; index++) {
			const token = tokens[index];
			if (token === '(' || token === '[') stack.push(token === '(' ? ')' : ']');
			else if (token === ')' || token === ']') {
				if (stack.pop() !== token) throw new Error('Mismatched gallery registry array');
				if (stack.length === 0) return index;
			}
		}
		throw new Error('Unclosed gallery registry array');
	};
	const entries: Record<string, GalleryEntry> = {};
	for (let index = 0; index < tokens.length; index++) {
		if (
			!isString(tokens[index]) ||
			tokens[index + 1] !== '=>' ||
			tokens[index + 2] !== 'array' ||
			tokens[index + 3] !== '('
		)
			continue;
		const key = unquote(tokens[index]);
		const end = endOfGroup(index + 3);
		const fields: GalleryEntry = {};
		for (let cursor = index + 4; cursor < end; cursor++) {
			if (!isString(tokens[cursor]) || tokens[cursor + 1] !== '=>') continue;
			const field = unquote(tokens[cursor]);
			cursor += 2;
			const value = tokens[cursor];
			if ((value === 'array' || value === '__') && tokens[cursor + 1] === '(') {
				if (value === '__' && isString(tokens[cursor + 2]))
					fields[field] = unquote(tokens[cursor + 2]);
				cursor = endOfGroup(cursor + 1);
			} else if (value === '[') cursor = endOfGroup(cursor);
			else if (isString(value)) fields[field] = unquote(value);
			else if (/^-?\d+$/.test(value)) fields[field] = Number(value);
			else if (value === 'true' || value === 'false') fields[field] = value === 'true';
			else if (value === 'null') fields[field] = null;
		}
		entries[key] = fields;
		index = end;
	}
	return entries;
}
