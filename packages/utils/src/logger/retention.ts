const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * DAY_MS;
const MAX_LOG_BYTES = 25 * 1024 * 1024;
const FALLBACK_ROW_BYTES = 512;
const PAGE_SIZE = 500;

type RetainedLog = {
	logId: string;
	timestamp: number;
	sizeBytes?: number;
};

/**
 * Rows written before schema v2 (and by producers not yet migrated, e.g. the
 * audit plugin's full-snapshot rows) carry no sizeBytes — serialize them so
 * the byte cap cannot be dodged by large legacy rows charged at 512 bytes.
 */
function rowBytes(row: RetainedLog): number {
	if (typeof row.sizeBytes === 'number') return row.sizeBytes;
	try {
		// Match RxDocument.toJSON(): internal storage fields never counted toward retention.
		const data = Object.fromEntries(
			Object.entries(row).filter(
				([key]) => !['_rev', '_meta', '_deleted', '_attachments'].includes(key)
			)
		);
		return new TextEncoder().encode(JSON.stringify(data)).byteLength;
	} catch {
		return FALLBACK_ROW_BYTES;
	}
}

export type LogRetentionCollection = {
	find(query: Record<string, unknown>): unknown;
	storageInstance: { query(prepared: unknown): Promise<{ documents: RetainedLog[] }> };
	bulkRemove(ids: string[]): Promise<unknown>;
};

export async function sweepLogRetention(
	collection: LogRetentionCollection,
	now = Date.now()
): Promise<void> {
	const remaining: { primary: string; sizeBytes: number }[] = [];
	let after: RetainedLog | undefined;
	for (;;) {
		const query = collection.find({
			selector: after
				? {
						timestamp: { $gte: after.timestamp },
						$or: [
							{ timestamp: { $gt: after.timestamp } },
							{ timestamp: after.timestamp, logId: { $gt: after.logId } },
						],
					}
				: {},
			sort: [{ timestamp: 'asc' }, { logId: 'asc' }],
			limit: PAGE_SIZE,
		}) as { getPreparedQuery(): unknown };
		// Raw, bounded responses avoid retaining the whole history as cached RxDocuments.
		const { documents } = await collection.storageInstance.query(query.getPreparedQuery());
		if (documents.length === 0) break;
		after = documents[documents.length - 1];
		const expired: string[] = [];
		for (const row of documents) {
			if (row.timestamp < now - RETENTION_MS) expired.push(row.logId);
			else remaining.push({ primary: row.logId, sizeBytes: rowBytes(row) });
		}
		if (expired.length) await collection.bulkRemove(expired);
	}
	const sizes = remaining.map((row) => row.sizeBytes);
	let totalBytes = sizes.reduce((total, bytes) => total + bytes, 0);
	if (totalBytes <= MAX_LOG_BYTES) return;

	const removeIds: string[] = [];
	for (let i = 0; i < remaining.length; i += 1) {
		removeIds.push(remaining[i].primary);
		totalBytes -= sizes[i];
		if (totalBytes <= MAX_LOG_BYTES) break;
	}
	for (let offset = 0; offset < removeIds.length; offset += PAGE_SIZE) {
		await collection.bulkRemove(removeIds.slice(offset, offset + PAGE_SIZE));
	}
}
