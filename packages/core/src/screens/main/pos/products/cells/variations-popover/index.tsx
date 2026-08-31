import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { Variations } from './variations';
import { QueryStateProvider, useCollectionBinding, useQueryState } from '../../../../../../query';

const popoverLogger = getLogger(['wcpos', 'pos', 'variations-popover']);

// Run 33357460009 (iOS tablet, 2026-08-31): the popover's single mount-time
// refresh issued ONE GET /wcpos/v2/variations which died in 809 ms (status 0,
// engine SYNC121 - the request was cancelled client-side) and NOTHING retried:
// the popover showed "Syncing..." for the 10 minutes the E2E flow kept tapping
// greyed options. sync() swallows per-handle failures by design, so the caller
// cannot see the failure - the only honest recovery is to watch the RESULT and
// re-ask while it stays empty. Two spaced retries cover a transient failure; a
// parent whose variations genuinely are not on the server stops the loop when
// the retries are spent, and every retry logs so CI artifacts can count
// firings. Values in code, not env - nobody tunes this without editing it.
const VARIATION_SYNC_RETRY_DELAYS_MS = [3000, 10000];

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];

interface VariationsPopoverProps {
	parent: EngineRecord<'products'>;
	addToCart: (variation: EngineRecord<'variations'>, metaData: LineItem['meta_data']) => void;
	/**
	 * The products list's Stock Status filter. The CALLER must read this at the popover
	 * trigger site (`useProductsStockStatusFilter`) and pass it down: on native,
	 * PopoverContent renders through the portal host at the app root, so no screen
	 * provider — including the products QueryStateProvider — is an ancestor of this
	 * component, and reading it here crashes. The pill governs here exactly as it does
	 * in the expanded table: a colour leading only to variations outside the filter is
	 * greyed out. With the pill cleared every colour is selectable and the disabled
	 * Add to Cart button carries the stock news instead.
	 */
	stockStatus?: string;
}

type VariationsPopoverContentProps = VariationsPopoverProps;

/**
 *
 */
function VariationsPopoverContent({
	parent,
	addToCart,
	stockStatus,
}: VariationsPopoverContentProps) {
	const state = useQueryState<'variations'>();
	const variationIds = useRecordField(parent, (record) => record.payload.variations);
	const remoteIds = (variationIds ?? [])
		.map(remoteIdOrNull)
		.filter((remoteId) => remoteId !== null);
	const binding = useCollectionBinding('variations', state, {
		remoteIds,
	});
	const initialBinding = React.useRef(binding);
	React.useEffect(() => {
		// Refresh once per popover open without blocking locally resident variations,
		// then retry (bounded, logged) while no variation has materialized - see
		// VARIATION_SYNC_RETRY_DELAYS_MS above for the live failure this recovers.
		const openBinding = initialBinding.current;
		const result$ = (
			openBinding as {
				result$?: {
					subscribe(next: (result: { count: number }) => void): { unsubscribe(): void };
				};
			}
		).result$;
		let variationCount = -1; // unknown until the binding reports
		const subscription = result$?.subscribe((result) => {
			variationCount = result.count;
		});
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let attempt = 0;
		const attemptSync = () => {
			// A retry timer scheduled while the count was 0 can fire AFTER result$
			// reported variations - skip the redundant refresh (CodeRabbit, #1729).
			if (cancelled || (attempt > 0 && variationCount !== 0)) return;
			attempt += 1;
			void openBinding
				.sync()
				.catch(() => undefined)
				.then(() => {
					if (cancelled || variationCount !== 0) return;
					const delay = VARIATION_SYNC_RETRY_DELAYS_MS[attempt - 1];
					if (delay === undefined) return;
					popoverLogger.warn('Variation refresh yielded no variations, retrying', {
						context: { attempt, retryInMs: delay },
					});
					timer = setTimeout(attemptSync, delay);
				});
		};
		attemptSync();
		return () => {
			cancelled = true;
			if (timer !== undefined) clearTimeout(timer);
			subscription?.unsubscribe();
		};
	}, []);
	const allVariationsState = React.useMemo(
		() => ({
			...state,
			filters: { ...state.filters, attributeMatches: [] },
		}),
		[state]
	);
	const allVariationsBinding = useCollectionBinding('variations', allVariationsState, {
		remoteIds,
	});
	return (
		<ErrorBoundary>
			<Suspense>
				<Variations
					binding={binding}
					allVariationsResource={allVariationsBinding.resource}
					parent={parent}
					addToCart={addToCart}
					stockStatus={stockStatus}
				/>
			</Suspense>
		</ErrorBoundary>
	);
}

/**
 * The products list's Stock Status filter, for the popover trigger site. Must be called
 * where the trigger renders (inside the products QueryStateProvider), never inside
 * PopoverContent — see the `stockStatus` prop above.
 */
export function useProductsStockStatusFilter(): string | undefined {
	return useQueryState<'products', string | undefined>((state) => state.filters.stock_status);
}

export function VariationsPopover(props: VariationsPopoverProps) {
	return (
		<QueryStateProvider
			collection="variations"
			initialPageSize={Number.MAX_SAFE_INTEGER}
			initialSort={{ field: 'name', direction: 'asc' }}
			initialFilters={{ status: 'publish' }}
		>
			<VariationsPopoverContent {...props} />
		</QueryStateProvider>
	);
}
