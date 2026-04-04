export interface IndexedDbStoreSnapshot {
	name: string;
	records: unknown[];
}

export interface IndexedDbDatabaseSnapshot {
	name: string;
	version: number;
	stores: IndexedDbStoreSnapshot[];
}

export interface SessionIds {
	siteID: string;
	wpCredentialsID: string;
	storeID: string;
}

interface RxStateStoreTarget {
	dbName: string;
	dbVersion: number;
	storeName: string;
}

type AnyRecord = Record<string, unknown>;

const isObject = (value: unknown): value is AnyRecord =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const asNonEmptyString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const readDoc = (record: unknown): AnyRecord | null => {
	if (!isObject(record)) return null;
	const doc = record.d;
	return isObject(doc) ? doc : null;
};

const readRecordId = (record: unknown): string | undefined => {
	if (!isObject(record)) return undefined;
	return asNonEmptyString(record.i);
};

const isSiteDoc = (doc: AnyRecord): boolean =>
	typeof doc.url === 'string' &&
	(typeof doc.wcpos_api_url === 'string' || Array.isArray(doc.wp_credentials));

const isWpCredentialsDoc = (doc: AnyRecord): boolean =>
	typeof doc.access_token === 'string' &&
	(typeof doc.refresh_token === 'string' || Array.isArray(doc.stores));

const isStoreDoc = (doc: AnyRecord): boolean =>
	typeof doc.name === 'string' &&
	('store_country' in doc || 'currency' in doc || 'default_customer_address' in doc);

function assignSessionIdsFromRecord(ids: SessionIds, record: unknown): void {
	const doc = readDoc(record);
	if (!doc) return;

	if (!ids.siteID && isSiteDoc(doc)) {
		ids.siteID = asNonEmptyString(doc.uuid) || readRecordId(record) || '';
	}

	if (!ids.wpCredentialsID && isWpCredentialsDoc(doc)) {
		ids.wpCredentialsID = asNonEmptyString(doc.uuid) || readRecordId(record) || '';
	}

	if (!ids.storeID) {
		if (Array.isArray(doc.stores)) {
			const firstStore = doc.stores.find((entry) => asNonEmptyString(entry));
			if (firstStore) {
				ids.storeID = firstStore as string;
			}
		}

		if (!ids.storeID && isStoreDoc(doc)) {
			ids.storeID =
				asNonEmptyString(doc.localID) ||
				asNonEmptyString(doc.uuid) ||
				readRecordId(record) ||
				'';
		}
	}
}

export function extractSessionIdsFromDatabases(
	databases: IndexedDbDatabaseSnapshot[]
): SessionIds {
	const ids: SessionIds = {
		siteID: '',
		wpCredentialsID: '',
		storeID: '',
	};

	for (const db of databases) {
		for (const store of db.stores) {
			for (const record of store.records) {
				assignSessionIdsFromRecord(ids, record);
				if (ids.siteID && ids.wpCredentialsID && ids.storeID) {
					return ids;
				}
			}
		}
	}

	return ids;
}

export function findRxStateStoreTarget(
	databases: IndexedDbDatabaseSnapshot[]
): RxStateStoreTarget | null {
	for (const db of databases) {
		const store = db.stores.find((candidate) => candidate.name.startsWith('rx-state-v2'));
		if (store) {
			return {
				dbName: db.name,
				dbVersion: db.version,
				storeName: store.name,
			};
		}
	}

	return null;
}
