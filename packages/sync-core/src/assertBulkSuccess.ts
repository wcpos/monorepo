export type RxBulkWriteFailure = {
	documentId?: string;
	status?: number;
	writeRow?: { document?: Record<string, unknown> };
};

/** RxDB bulk APIs resolve even when individual rows fail. Treat every row
 * failure as an operation failure so callers cannot advance durable state
 * past data that was never applied. No current call site tolerates partials. */
export function assertBulkSuccess<T>(result: T, context: string): T {
	const failures = (result as { error?: RxBulkWriteFailure[] } | null)?.error ?? [];
	if (failures.length === 0) return result;
	const ids = failures.map(
		(failure, index) =>
			failure.documentId ??
			String(
				failure.writeRow?.document?.id ??
					failure.writeRow?.document?.mutationId ??
					`row-${index + 1}`
			)
	);
	const error = Object.assign(
		new Error(`${context} failed for ${failures.length} row(s): ${ids.join(', ')}`),
		{
			failedIds: ids,
			status: failures[0]?.status ?? 500,
		}
	);
	throw error;
}
