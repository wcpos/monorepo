import { ensureRxStorageInstanceParamsAreCorrect } from 'rxdb/plugins/core';
import { createBlobFromBase64 } from 'rxdb/plugins/utils';
import {
	createSQLiteStorageInstance,
	getRxStorageSQLite,
} from 'rxdb-premium-old/plugins/storage-sqlite';

import type {
	RxStorageSQLite,
	SQLiteInstanceCreationOptions,
	SQLiteStorageSettings,
} from 'rxdb-premium-old/plugins/storage-sqlite';
import type { RxStorageInstanceCreationParams } from 'rxdb/plugins/core';

type LegacyAttachmentData = Blob | ArrayBuffer | ArrayBufferView | string;

type LegacyMigrationStorageInstance = {
	getAttachmentData?: (...args: unknown[]) => Promise<LegacyAttachmentData>;
};

async function normalizeLegacyAttachmentData(data: LegacyAttachmentData): Promise<Blob> {
	if (data instanceof Blob) {
		return data;
	}

	if (typeof data === 'string') {
		return createBlobFromBase64(data, '');
	}

	if (data instanceof ArrayBuffer) {
		return new Blob([data]);
	}

	if (ArrayBuffer.isView(data)) {
		const bytes = new Uint8Array(data.byteLength);
		bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
		return new Blob([bytes]);
	}

	return new Blob([data]);
}

/**
 * Migration-only wrapper around the legacy premium SQLite storage.
 *
 * rxdb-premium-old@16.21.1 currently resolves its peer import `rxdb` to the
 * workspace's rxdb@17, so its built-in checkVersion() guard throws before the
 * storage instance is created. We still need the legacy SQLite implementation
 * for one-time migration reads, so this wrapper keeps the same storage object
 * but overrides createStorageInstance() to skip only that version guard.
 */
export function getLegacyMigrationRxStorageSQLite(
	settings: SQLiteStorageSettings
): RxStorageSQLite {
	const storage = getRxStorageSQLite(settings);

	storage.createStorageInstance = (async <RxDocType>(
		params: RxStorageInstanceCreationParams<RxDocType, SQLiteInstanceCreationOptions>
	) => {
		ensureRxStorageInstanceParamsAreCorrect(params);
		const instance = (await createSQLiteStorageInstance(
			storage,
			params,
			storage.settings
		)) as LegacyMigrationStorageInstance;

		if (instance.getAttachmentData) {
			const getAttachmentData = instance.getAttachmentData.bind(instance);
			instance.getAttachmentData = async (...args: unknown[]) => {
				const data = await getAttachmentData(...args);
				return normalizeLegacyAttachmentData(data);
			};
		}

		return instance as Awaited<ReturnType<typeof createSQLiteStorageInstance>>;
	}) as typeof storage.createStorageInstance;

	return storage;
}
