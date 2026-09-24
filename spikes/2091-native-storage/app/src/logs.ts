const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'assert'] as const;
const hooks = ['__wcposOnStorageRecovery', '__wcposOnIndexRebuild', '__wcposOnStorageRunFailure'];
// Shared by RN capture and worklet forwarding; logging must not alter storage behavior.
export function logText(value: unknown): string {
	'worklet';
	try {
		if (typeof value === 'string') return value;
		if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`;
		const seen = new WeakSet<object>();
		return (
			JSON.stringify(value, (_key, item: unknown) => {
				if (item instanceof Error) return `${item.name}: ${item.message}\n${item.stack ?? ''}`;
				if (typeof item === 'bigint') return String(item);
				if (item && typeof item === 'object') {
					if (seen.has(item)) return '[Circular]';
					seen.add(item);
				}
				return item;
			}) ?? String(value)
		);
	} catch {
		try {
			return String(value);
		} catch {
			return '[Unserializable]';
		}
	}
}
export function captureLogs(onRetry?: () => void) {
	const logs: string[] = [],
		saved = methods.map((method) => console[method]);
	const globals = globalThis as unknown as Record<string, unknown>;
	const oldHooks = hooks.map((hook) => globals[hook]);
	for (const method of methods)
		console[method] = (...values: unknown[]) => {
			if (method === 'assert') {
				if (values[0]) return;
				values = values.slice(1);
			}
			const line = values.map(logText).join(' ');
			logs.push(line);
			try {
				if (/open transaction error \(will retry\)/.test(line)) onRetry?.();
			} catch {
				/* A diagnostic observer must not fail the storage call. */
			}
		};
	for (const hook of hooks)
		globals[hook] = (event: unknown) => logs.push(`recovery ${hook}: ${logText(event)}`);
	return {
		logs,
		restore() {
			methods.forEach((method, i) => {
				console[method] = saved[i];
			});
			hooks.forEach((hook, i) => {
				globals[hook] = oldHooks[i];
			});
		},
	};
}
