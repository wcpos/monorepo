import { catchError, EMPTY } from 'rxjs';

import { LEDGER_META_KEY, OFFLINE_DEVICE_AUTHORIZATION } from '@wcpos/order-math';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { engineCollection } from '../records/engine-collection';
import { observeResidentRead } from '../resident-read';

import type { EngineRecord } from '../records/engine-record';

/** Resident offline authorizations only; every missing database emits an empty list. */
export function observeOfflineDeviceAuthorizations(engine: RxdbSyncEngine) {
	return observeResidentRead<EngineRecord<'orders'>[]>(engine, {
		collections: ['orders'],
		absent: [],
		read: (database) =>
			engineCollection(database, 'orders')!
				.find({
					selector: {
						'payload.meta_data': {
							$elemMatch: {
								key: LEDGER_META_KEY,
								'value.payments': {
									$elemMatch: { ...OFFLINE_DEVICE_AUTHORIZATION },
								},
							},
						},
					},
				})
				.$.pipe(
					catchError((error) => {
						getLogger(['wcpos', 'payments']).error('Offline reader settlement recovery failed', {
							code: ERROR_CODES.PAYMENT_UNEXPECTED,
							context: { error: String(error) },
						});
						return EMPTY; // Keep watching database replacements after this query fails.
					})
				),
	});
}
