import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useQueryRuntime } from '@wcpos/query';
import { demandRecordsByWooId } from '@wcpos/query/record-readers';
import { useCoverageGeneration } from '@wcpos/query/query-state';
import { getLogger } from '@wcpos/utils/logger';

import type { LocalProduct } from './aggregate';

/** At most this many missing products are requested per report scope: the most-named first. */
export const MAX_REPORT_PRODUCT_DEMAND = 500;
/** Orders arrive in pages as the report loads; wait for the id list to settle before demanding. */
export const REPORT_PRODUCT_DEMAND_DEBOUNCE_MS = 500;

const logger = getLogger(['wcpos', 'reports', 'product-demand']);
const isPositiveInteger = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value > 0;

/** The named ids neither on this device nor attempted, most-named first, then by id. */
function missingIds(
	productIds: readonly number[],
	local: readonly LocalProduct[],
	attempted: ReadonlySet<number>
): number[] {
	const onDevice = new Set(local.map((product) => product.id));
	const counts = new Map<number, number>();
	for (const id of productIds) {
		if (!isPositiveInteger(id) || onDevice.has(id) || attempted.has(id)) continue;
		counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return [...counts]
		.sort(([a, aCount], [b, bCount]) => bCount - aCount || a - b)
		.slice(0, MAX_REPORT_PRODUCT_DEMAND)
		.map(([id]) => id);
}

/**
 * While the store is reachable, fetch the products the period's lines name that this device does
 * not hold, so the grouped cards and panels can place them. `local` undefined is still loading.
 */
export function useReportProductDemand(
	productIds: readonly number[],
	local: readonly LocalProduct[] | undefined
): void {
	const runtime = useQueryRuntime();
	const generation = useCoverageGeneration(runtime.engine, 'products');
	const online = useOnlineStatus().status === 'online-website-available';
	// The same identity as useReferencedCustomerDemand: a reset or store switch gets a fresh set.
	// Late completions only mark the outgoing scope's set.
	const [attempts, setAttempts] = React.useState(() => ({
		engine: runtime.engine,
		generation,
		ids: new Set<number>(),
	}));
	let attemptedIds = attempts.ids;
	if (attempts.engine !== runtime.engine || attempts.generation !== generation) {
		attemptedIds = new Set<number>();
		setAttempts({ engine: runtime.engine, generation, ids: attemptedIds });
	}
	const key =
		local === undefined || !online ? '' : missingIds(productIds, local, attemptedIds).join(',');

	React.useEffect(() => {
		if (!online || key === '') return;
		const wooIds = key.split(',').map(Number);
		let requirement: ReturnType<typeof demandRecordsByWooId> | undefined;
		const timer = setTimeout(() => {
			requirement = demandRecordsByWooId(runtime.engine, {
				id: `reports:products-not-on-device:${key}`,
				collection: 'products',
				wooIds,
			});
			// Attempted only when settled: a server that no longer returns an id still settles, so it
			// is not asked again; a superseded ('released') or failed demand asks again next time.
			void requirement.ready
				.then((outcome) => {
					if (outcome === 'settled') wooIds.forEach((id) => attemptedIds.add(id));
				})
				.catch(() => {
					logger.debug('Report product demand failed');
				});
		}, REPORT_PRODUCT_DEMAND_DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			requirement?.release();
		};
	}, [runtime.engine, key, online, attemptedIds]);
}
