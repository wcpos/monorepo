const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * DAY_MS;
const MAX_LOG_BYTES = 25 * 1024 * 1024;
const FALLBACK_ROW_BYTES = 512;

type RetainedLog = {
	primary: string;
	sizeBytes?: number;
	toJSON?: () => unknown;
};

/**
 * Rows written before schema v2 (and by producers not yet migrated, e.g. the
 * audit plugin's full-snapshot rows) carry no sizeBytes — serialize them so
 * the byte cap cannot be dodged by large legacy rows charged at 512 bytes.
 */
function rowBytes(row: RetainedLog): number {
	if (typeof row.sizeBytes === 'number') return row.sizeBytes;
	try {
		return new TextEncoder().encode(JSON.stringify(row.toJSON ? row.toJSON() : row)).byteLength;
	} catch {
		return FALLBACK_ROW_BYTES;
	}
}

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
	const sizes = remaining.map(rowBytes);
	let totalBytes = sizes.reduce((total, bytes) => total + bytes, 0);
	if (totalBytes <= MAX_LOG_BYTES) return;

	const removeIds: string[] = [];
	for (let i = 0; i < remaining.length; i += 1) {
		removeIds.push(remaining[i].primary);
		totalBytes -= sizes[i];
		if (totalBytes <= MAX_LOG_BYTES) break;
	}
	await collection.bulkRemove(removeIds);
}
