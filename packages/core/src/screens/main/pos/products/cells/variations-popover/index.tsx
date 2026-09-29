import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { useVariationsRefresh } from './use-variations-refresh';
import { Variations } from './variations';
import { QueryStateProvider, useCollectionBinding, useQueryState } from '../../../../../../query';

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
	 * greyed out. With the pill cleared every colour is selectable and the stock badge
	 * carries the stock news instead; Add to Cart disables on it only while the store
	 * prevents overselling (see `VariationAddToCart`).
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
	// Refresh once per popover open, then retry (bounded, logged) while no variation has
	// materialized: `use-variations-refresh.ts` carries the two live runs this recovers.
	useVariationsRefresh(binding);
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
