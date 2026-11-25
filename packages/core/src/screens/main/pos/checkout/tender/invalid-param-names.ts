/** POS-357: name refused fields in payment logs, never their values. */
export function invalidParamContext(error: unknown): { invalidParams?: string } {
	try {
		for (let depth = 0; depth < 5 && typeof error === 'object' && error !== null; depth++) {
			for (const path of ['data.params', 'response.data.data.params']) {
				let p: unknown = error;
				for (const key of path.split('.'))
					p = typeof p === 'object' && p !== null ? (p as Record<string, unknown>)[key] : undefined;
				if (typeof p !== 'object' || p === null || Array.isArray(p)) continue;
				const keys = Object.keys(p).sort().slice(0, 20);
				if (keys.length) return { invalidParams: keys.map((k) => k.slice(0, 64)).join(', ') };
				break;
			}
			error = (error as { cause?: unknown }).cause;
		}
	} catch {
		return {};
	}
	return {};
}
