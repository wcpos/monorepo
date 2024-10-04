import { Observable, forkJoin, from } from 'rxjs';

import type { StoreDatabase } from '@wcpos/database';

import { mergeWithInitalValues, UISettingSchema, UISettingState, UISettingID } from './utils';

const settingIds: UISettingID[] = [
	'pos-products',
	'pos-cart',
	'products',
	'orders',
	'customers',
	'reports-orders',
	'logs',
];

/**
 *
 */
export function hydratedSettings(
	storeDB: StoreDatabase
): Observable<Record<UISettingID, UISettingState<UISettingID>>> {
	const settingObservables = settingIds.reduce(
		(acc, id) => {
			acc[id] = from(
				storeDB.addState<UISettingSchema<typeof id>>(`${id}_v2`).then(async (state) => {
					await mergeWithInitalValues(id, state);
					return state;
				})
			);
			return acc;
		},
		{} as Record<UISettingID, Observable<UISettingState<UISettingID>>>
	);

	// Use forkJoin to wait for all observables to complete
	return forkJoin(settingObservables);
}
