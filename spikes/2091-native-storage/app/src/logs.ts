const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'assert'] as const;
const hooks = ['__wcposOnStorageRecovery', '__wcposOnIndexRebuild', '__wcposOnStorageRunFailure'];
export function captureLogs(onRetry?: () => void) {
	const logs: string[] = [],
		saved = methods.map((method) => console[method]);
	const globals = globalThis as unknown as Record<string, unknown>;
	const oldHooks = hooks.map((hook) => globals[hook]);
	for (const method of methods)
		console[method] = (...values: unknown[]) => {
			const line = values
				.map((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
				.join(' ');
			logs.push(line);
			if (/open transaction error \(will retry\)/.test(line)) onRetry?.();
		};
	for (const hook of hooks)
		globals[hook] = (event: unknown) => logs.push(`recovery ${hook}: ${JSON.stringify(event)}`);
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
