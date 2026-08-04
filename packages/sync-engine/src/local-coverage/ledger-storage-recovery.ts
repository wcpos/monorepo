const RECONCILIATION_REFUSAL_MARKER = 'index reconciliation refused:';
const NON_CORRUPTION_REFUSALS = new Set(['no-divergence', 'multi-instance']);
const rebuiltDatabases = new Set<string>();

function errorMessage(error: unknown): string | undefined {
	if (typeof error === 'string') return error;
	if (
		error !== null &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}
	return undefined;
}

function reconciliationRefusalReason(error: unknown): string | undefined {
	const message = errorMessage(error);
	const markerIndex = message?.indexOf(RECONCILIATION_REFUSAL_MARKER) ?? -1;
	if (!message || markerIndex < 0) return undefined;
	return message.slice(markerIndex + RECONCILIATION_REFUSAL_MARKER.length).trim();
}

export function isReconciliationRefusalError(error: unknown): boolean {
	const reason = reconciliationRefusalReason(error);
	return reason !== undefined && !NON_CORRUPTION_REFUSALS.has(reason);
}

export function withLedgerRecovery<T extends object>(input: {
	databaseName: string;
	repository: T;
	rebuild: (reason: string) => Promise<T>;
}): T {
	let repository = input.repository;
	const run = async (property: string | symbol, args: unknown[]): Promise<unknown> => {
		try {
			return await Reflect.apply(
				Reflect.get(repository, property) as (...methodArgs: unknown[]) => unknown,
				repository,
				args
			);
		} catch (error) {
			const reason = reconciliationRefusalReason(error);
			if (
				reason === undefined ||
				NON_CORRUPTION_REFUSALS.has(reason) ||
				rebuiltDatabases.has(input.databaseName)
			) {
				throw error;
			}

			rebuiltDatabases.add(input.databaseName);
			repository = await input.rebuild(reason);
			return Reflect.apply(
				Reflect.get(repository, property) as (...methodArgs: unknown[]) => unknown,
				repository,
				args
			);
		}
	};

	return new Proxy(input.repository, {
		get: (_target, property) => {
			const value = Reflect.get(repository, property);
			return typeof value === 'function' ? (...args: unknown[]) => run(property, args) : value;
		},
	});
}
