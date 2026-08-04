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
	// Startup and the maintenance lanes run coverage operations in parallel, so
	// several callers catch the same refusal. The rebuild is therefore shared:
	// one runs at a time, and an operation whose failure predates a completed
	// rebuild retries against the refreshed ledger instead of rethrowing a stale
	// error. Same shape as the worker's own reconcileOnce/reconcileGeneration
	// (packages/database/src/plugins/opfs-targeted-recovery.mjs).
	let pendingRebuild: Promise<void> | undefined;
	let rebuildGeneration = 0;

	const invoke = (property: string | symbol, args: unknown[]): unknown =>
		Reflect.apply(
			Reflect.get(repository, property) as (...methodArgs: unknown[]) => unknown,
			repository,
			args
		);

	const rebuildOnce = (reason: string): Promise<void> => {
		if (!pendingRebuild) {
			pendingRebuild = input
				.rebuild(reason)
				.then((freshRepository) => {
					repository = freshRepository;
					rebuildGeneration += 1;
				})
				.finally(() => {
					pendingRebuild = undefined;
				});
		}
		return pendingRebuild;
	};

	const run = async (property: string | symbol, args: unknown[]): Promise<unknown> => {
		const generationAtStart = rebuildGeneration;
		try {
			return await invoke(property, args);
		} catch (error) {
			const reason = reconciliationRefusalReason(error);
			if (reason === undefined || NON_CORRUPTION_REFUSALS.has(reason)) throw error;

			// Someone else's rebuild landed while this operation was in flight.
			if (rebuildGeneration !== generationAtStart) return invoke(property, args);

			// A rebuild is running right now — wait for it rather than leaking the
			// refusal into an otherwise recoverable caller. If it fails, this
			// operation genuinely failed, so surface its own storage error.
			if (pendingRebuild) {
				await pendingRebuild.catch(() => {
					throw error;
				});
				return invoke(property, args);
			}

			if (rebuiltDatabases.has(input.databaseName)) throw error;
			rebuiltDatabases.add(input.databaseName);
			await rebuildOnce(reason);
			return invoke(property, args);
		}
	};

	return new Proxy(input.repository, {
		get: (_target, property) => {
			const value = Reflect.get(repository, property);
			return typeof value === 'function' ? (...args: unknown[]) => run(property, args) : value;
		},
	});
}
