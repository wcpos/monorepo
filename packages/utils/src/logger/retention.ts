const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * DAY_MS;
const MAX_LOG_BYTES = 25 * 1024 * 1024;
const FALLBACK_ROW_BYTES = 512;

type RetainedLog = {
	primary: string;
	sizeBytes?: number;
};

export type LogRetentionCollection = {
	find(query: Record<string, unknown>): unknown;
	bulkRemove(ids: string[]): Promise<unknown>;
};

export async function sweepLogRetention(
	collection: LogRetentionCollection,
	now = Date.now()
): Promise<void> {
	const expiredQuery = collection.find({
		selector: { timestamp: { $lt: now - RETENTION_MS } },
	}) as { remove(): Promise<unknown> };
	await expiredQuery.remove();

	const remainingQuery = collection.find({
		sort: [{ timestamp: 'asc' }],
	}) as { exec(): Promise<RetainedLog[]> };
	const remaining = await remainingQuery.exec();
	let totalBytes = remaining.reduce(
		(total, row) => total + (row.sizeBytes ?? FALLBACK_ROW_BYTES),
		0
	);
	if (totalBytes <= MAX_LOG_BYTES) return;

	const removeIds: string[] = [];
	for (const row of remaining) {
		removeIds.push(row.primary);
		totalBytes -= row.sizeBytes ?? FALLBACK_ROW_BYTES;
		if (totalBytes <= MAX_LOG_BYTES) break;
	}
	await collection.bulkRemove(removeIds);
}
