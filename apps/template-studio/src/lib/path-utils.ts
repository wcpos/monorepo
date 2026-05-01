export type PathSegment = string | number;

export function getAtPath(root: unknown, path: readonly PathSegment[]): unknown {
	let current: unknown = root;
	for (const segment of path) {
		if (current == null) return undefined;
		current = (current as Record<string, unknown>)[segment as string];
	}
	return current;
}

export function setAtPath<T>(root: T, path: readonly PathSegment[], value: unknown): T {
	if (path.length === 0) return value as T;
	const [head, ...rest] = path;
	if (Array.isArray(root)) {
		const next = root.slice();
		next[head as number] = setAtPath(next[head as number], rest, value);
		return next as unknown as T;
	}
	const obj = (root ?? {}) as Record<string, unknown>;
	return {
		...obj,
		[head as string]: setAtPath(obj[head as string], rest, value),
	} as T;
}

export function removeAtPath<T>(root: T, path: readonly PathSegment[]): T {
	if (path.length === 0) return root;
	if (path.length === 1) {
		if (Array.isArray(root)) {
			const next = root.slice();
			next.splice(path[0] as number, 1);
			return next as unknown as T;
		}
		const obj = (root ?? {}) as Record<string, unknown>;
		const next = { ...obj };
		delete next[path[0] as string];
		return next as T;
	}
	const [head, ...rest] = path;
	if (Array.isArray(root)) {
		const next = root.slice();
		next[head as number] = removeAtPath(next[head as number], rest);
		return next as unknown as T;
	}
	const obj = (root ?? {}) as Record<string, unknown>;
	return {
		...obj,
		[head as string]: removeAtPath(obj[head as string], rest),
	} as T;
}

export function pathLabel(path: readonly PathSegment[]): string {
	return path
		.map((segment, index) =>
			typeof segment === 'number' ? `[${segment}]` : index === 0 ? segment : `.${segment}`
		)
		.join('');
}
