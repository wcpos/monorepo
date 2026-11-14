import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useQueryRuntime } from '@wcpos/query';
import { demandRecordsByWooId } from '@wcpos/query/record-readers';
import { useCoverageGeneration } from '@wcpos/query/query-state';
import { getLogger } from '@wcpos/utils/logger';

import { useQueryHandleFields } from '../../../../query';
import { useReportsData, useReportsHandles } from '../context';

import type { LocalProduct } from './aggregate';

/**
 * At most this many missing products are requested per report open (one mount of the hook),
 * most-named first; the rest stay in the unknown-product bucket and are not fetched until the
 * report is opened again.
 */
export const MAX_REPORT_PRODUCT_DEMAND = 500;
/** Orders arrive in pages as the report loads; wait for the id list to settle before demanding. */
export const REPORT_PRODUCT_DEMAND_DEBOUNCE_MS = 500;
/**
 * One engine by-ids request (`INCLUDE_CHUNK`), so the shared durable lane holds at most one
 * report request at a time.
 */
export const REPORT_PRODUCT_DEMAND_CHUNK = 50;

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
	return [...counts].sort(([a, aCount], [b, bCount]) => bCount - aCount || a - b).map(([id]) => id);
}

/** The period's sale and refund lines are all here: both lanes complete and the refunds joined. */
export function useReportLinesLoaded(): boolean {
	const { handle, refundsHandle } = useReportsHandles();
	const sales = useQueryHandleFields(handle, ['laneProgress']);
	const refunds = useQueryHandleFields(refundsHandle, ['laneProgress']);
	const { periodRefunds } = useReportsData();
	return (
		sales.ready &&
		sales.laneProgress == null &&
		refunds.ready &&
		refunds.laneProgress == null &&
		periodRefunds !== undefined
	);
}

/**
 * While the store is reachable and the period's lines have loaded, fetch the products those lines
 * name that this device does not hold, so the grouped cards and panels can place them. `local`
 * undefined is still loading.
 */
export function useReportProductDemand(
	productIds: readonly number[],
	local: readonly LocalProduct[] | undefined,
	linesLoaded: boolean
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
	// Ids issued in this mount, across engines and generations: the per-open budget.
	const spentRef = React.useRef(0);
	// Read when a run starts, never a trigger: products landing locally must not restart the run.
	const toDemand = React.useEffectEvent((attempted: ReadonlySet<number>) =>
		local === undefined
			? []
			: missingIds(productIds, local, attempted).slice(
					0,
					MAX_REPORT_PRODUCT_DEMAND - spentRef.current
				)
	);
	const localLoading = local === undefined;
	const periodKey = [...new Set(productIds.filter(isPositiveInteger))]
		.sort((a, b) => a - b)
		.join(',');

	React.useEffect(() => {
		if (!online || !linesLoaded || localLoading) return;
		let cancelled = false;
		let requirement: ReturnType<typeof demandRecordsByWooId> | undefined;
		const run = async () => {
			const wooIds = toDemand(attemptedIds);
			// One chunk at a time, so the report's own reads never queue behind a burst of ours.
			for (
				let start = 0;
				!cancelled && start < wooIds.length;
				start += REPORT_PRODUCT_DEMAND_CHUNK
			) {
				const chunk = wooIds.slice(start, start + REPORT_PRODUCT_DEMAND_CHUNK);
				spentRef.current += chunk.length;
				requirement = demandRecordsByWooId(runtime.engine, {
					id: `reports:products-not-on-device:${chunk.join(',')}`,
					collection: 'products',
					wooIds: chunk,
				});
				// Attempted only when settled: a server that no longer returns an id still settles, so it
				// is not asked again; a released or failed chunk ends the run and asks again next run.
				if ((await requirement.ready) !== 'settled') return;
				chunk.forEach((id) => attemptedIds.add(id));
			}
		};
		const timer = setTimeout(() => {
			run().catch(() => {
				logger.debug('Report product demand failed');
			});
		}, REPORT_PRODUCT_DEMAND_DEBOUNCE_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
			requirement?.release();
		};
	}, [runtime.engine, attemptedIds, online, linesLoaded, localLoading, periodKey]);
}
