/**
 * Recursively flattens a React Hook Form errors object into a flat array
 * of { path, message } entries suitable for display.
 */
export function flattenErrors(
	errors: Record<string, unknown>,
	path = '',
	result: { path: string; message: string }[] = []
): { path: string; message: string }[] {
	Object.keys(errors).forEach((key) => {
		const error = errors[key] as Record<string, unknown> | undefined;
		const currentPath = path ? `${path}.${key}` : key;

		if (error && typeof error === 'object') {
			if (error.message) {
				// It's a field error
				result.push({ path: currentPath, message: String(error.message) });
			} else {
				// It's a nested object, recurse into it
				flattenErrors(error as Record<string, unknown>, currentPath, result);
			}
		}
	});

	return result;
}
