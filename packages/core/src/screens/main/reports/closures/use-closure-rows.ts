import * as React from 'react';

import { format } from 'date-fns';
import { useObservableState } from 'observable-hooks';
import { map, of } from 'rxjs';

import type { ClosureRow } from '@wcpos/database';

import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useClosureCollection } from '../../../../services/register-session/use-register-session-collections';

export type ClosureScope = {
	from: string;
	to: string;
	registerId: string;
	storeId?: number;
	cashier?: number;
};
export function selectClosureRows(
	rows: readonly ClosureRow[],
	scope: ClosureScope,
	timezone: string
) {
	return rows
		.map((row) => ({
			...row,
			business_day:
				row.business_day || format(new Date(row.closed_at), 'yyyy-MM-dd', zoneOptions(timezone)),
		}))
		.filter(
			(row) =>
				row.business_day >= scope.from &&
				row.business_day <= scope.to &&
				(!scope.registerId || row.register_id === scope.registerId) &&
				(row.store_id ?? 0) === (scope.storeId ?? 0) &&
				(scope.cashier === undefined || row.closed_by === scope.cashier)
		)
		.sort(
			(a, b) =>
				b.business_day.localeCompare(a.business_day) || b.closed_at.localeCompare(a.closed_at)
		);
}
export function useClosureRows(scope: ClosureScope) {
	const collection = useClosureCollection();
	const { timezone } = useStoreDay();
	const source = React.useMemo(
		() => (collection ? collection.find().$.pipe(map((rows) => ({ collection, rows }))) : of(null)),
		[collection]
	);
	const observed = useObservableState(source, null);
	return selectClosureRows(
		observed?.collection === collection
			? (observed?.rows.map((row) => row.toMutableJSON()) ?? [])
			: [],
		scope,
		timezone
	);
}
