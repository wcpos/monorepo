import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { distinctUntilChanged, map } from 'rxjs';

import {
	declareRequirements,
	observeEngineDatabases,
	observeEngineQuery,
	useQueryRuntime,
} from '@wcpos/query';
import { mintRemoteId } from '@wcpos/sync-core';
import type { RequirementHandle, WooRefundPayload } from '@wcpos/sync-engine';

export type WCRefund = WooRefundPayload;

/** Built above the modal's Suspense/error boundaries: only a local read can suspend or fail. */
export function useOrderRefunds(orderId: number) {
	const { engine, locale } = useQueryRuntime();
	const resource = React.useMemo(
		() =>
			new ObservableResource(
				observeEngineQuery(engine, locale, {
					collection: 'refunds',
					selector: { parent_id: orderId },
					limit: Number.MAX_SAFE_INTEGER,
				}).pipe(
					map(({ hits }) =>
						hits
							.map(({ record }) => record.payload as WCRefund)
							.sort((a, b) => b.date_created_gmt.localeCompare(a.date_created_gmt))
					)
				)
			),
		[engine, locale, orderId]
	);

	// The surface owns the demand and local subscription, including scope/collection replacement.
	React.useEffect(() => {
		let handle: RequirementHandle | undefined;
		const subscription = observeEngineDatabases(engine)
			.pipe(
				map((db) => db?.collections.refunds),
				distinctUntilChanged()
			)
			.subscribe((collection) => {
				handle?.release();
				handle = collection
					? declareRequirements(engine, [
							{
								id: `refunds:order-detail:${orderId}`,
								kind: 'refunds-by-parent',
								collection: 'refunds',
								parentRemoteId: mintRemoteId(orderId, 'refund parent'),
								forceRefresh: true,
							},
						])[0]
					: undefined;
			});
		return () => {
			subscription.unsubscribe();
			handle?.release();
			resource.destroy();
		};
	}, [engine, orderId, resource]);
	return resource;
}
