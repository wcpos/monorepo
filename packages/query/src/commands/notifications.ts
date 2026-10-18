import type { StoreDatabase } from '@wcpos/database';

import { StoreDatabaseUnavailableError } from './printer-profiles';

import type { NotificationRow, StoreLocalDatabase } from '../reads/store-local';

function notifications(database: StoreLocalDatabase) {
	if (!database) throw new StoreDatabaseUnavailableError();
	return database.collections.notifications as StoreDatabase['collections']['notifications'];
}

export async function markNotificationRead(
	database: StoreLocalDatabase,
	id: string
): Promise<boolean> {
	const doc = await notifications(database).findOne(id).exec();
	if (!doc) return false;
	await doc.patch({ status: 'read', seen: true });
	return true;
}

export async function markAllNotificationsRead(
	database: StoreLocalDatabase,
	subscriberId: string
): Promise<number> {
	const docs = await notifications(database)
		.find({ selector: { subscriberId, status: 'unread' } })
		.exec();
	await Promise.all(docs.map((doc) => doc.patch({ status: 'read', seen: true })));
	return docs.length;
}

export async function markAllNotificationsSeen(
	database: StoreLocalDatabase,
	subscriberId: string
): Promise<number> {
	const docs = await notifications(database)
		.find({ selector: { subscriberId, seen: false } })
		.exec();
	await Promise.all(docs.map((doc) => doc.patch({ seen: true })));
	return docs.length;
}

// Novu owns the server inbox; this store-local mirror has nothing for the Woo mutation queue.
export async function upsertNotification(
	database: StoreLocalDatabase,
	row: NotificationRow,
	{ preserveLocalState }: { preserveLocalState: boolean }
): Promise<void> {
	const collection = notifications(database);
	if (preserveLocalState) {
		const existing = await collection.findOne(row.id).exec();
		if (existing) {
			await existing.incrementalModify((current) => ({
				...current,
				...row,
				status: current.status === 'unread' ? row.status : current.status,
				seen: current.seen || row.seen,
			}));
		} else {
			// A concurrent WebSocket insert wins any primary-key conflict instead of being
			// overwritten by this older snapshot.
			await collection.insert(row);
		}
	} else {
		await collection.upsert(row);
	}
}
