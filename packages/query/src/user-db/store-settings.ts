import { tz } from '@date-fns/tz';
import { format } from 'date-fns';
import cloneDeep from 'lodash/cloneDeep';
import get from 'lodash/get';
import set from 'lodash/set';

import type { StoreDocument } from '@wcpos/database';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import type { ReadonlyStoreRecord } from './records';

const mutationLogger = getLogger(['wcpos', 'mutations', 'local']);

// The local-document branch of core's use-local-mutation.ts:430–584.
// Translation stays with the caller; query owns the write and its failure reporting.
export async function patchStoreSettings(
	store: ReadonlyStoreRecord,
	data: object,
	t: (key: 'common.there_was_an_error', params: { message: string }) => string
): Promise<{ changes: Record<string, unknown>; document: ReadonlyStoreRecord } | undefined> {
	const document = store as StoreDocument;
	try {
		const patchData = cloneDeep(data as Record<string, unknown>);
		if (get(document, 'collection.schema.jsonSchema.properties.date_modified_gmt')) {
			patchData.date_modified_gmt = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss", { in: tz('UTC') });
		}
		const patchEntries = Object.entries(patchData).filter(([, value]) => value !== undefined);
		if (patchEntries.length === 0) return { changes: {}, document };
		const latest = document.getLatest();
		const snapshot = latest.toMutableJSON?.() ?? (latest as unknown as Record<string, unknown>);
		const changes: Record<string, unknown> = {};
		for (const [key, value] of patchEntries) {
			const [root, ...path] = key.split('.');
			if (path.length === 0) {
				changes[root] = value;
				continue;
			}
			const rootValue = cloneDeep((snapshot as Record<string, unknown>)[root]);
			changes[root] = set(
				(rootValue ?? (Number.isInteger(Number(path[0])) ? [] : {})) as object,
				path,
				value
			);
		}
		const doc = await patchLocalResident(document.getLatest(), changes);
		return { changes, document: doc };
	} catch (error) {
		if ((error as { code?: string })?.code === 'write-superseded-by-delete') throw error;
		const err = error as Record<string, unknown>;
		let message = getErrorMessage(error);
		if (err.rxdb) message = 'rxdb ' + String(err.code);
		const identity: unknown = get(document, 'uuid') ?? document.id;
		mutationLogger.error('Local mutation failed', {
			code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
			showToast: true,
			toast: { title: t('common.there_was_an_error', { message }) },
			context: {
				documentId: typeof identity === 'string' && identity.length > 0 ? identity : null,
				collectionName: document.collection?.name,
				error: message,
			},
		});
	}
}

async function patchLocalResident(document: StoreDocument, changes: Record<string, unknown>) {
	return document.incrementalModify((old) => ({ ...old, ...changes }));
}
