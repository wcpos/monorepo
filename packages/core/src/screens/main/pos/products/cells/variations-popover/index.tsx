import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { Variations } from './variations';
import { QueryStateProvider, useCollectionBinding, useQueryState } from '../../../../../../query';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];

interface VariationsPopoverProps {
	parent: EngineRecord<'products'>;
	addToCart: (variation: EngineRecord<'variations'>, metaData: LineItem['meta_data']) => void;
}

interface VariationsPopoverContentProps extends VariationsPopoverProps {
	/** The products list's Stock Status filter, read outside the variations query state. */
	stockStatus?: string;
}

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
		// Refresh once per popover open without blocking locally resident variations.
		void initialBinding.current.sync().catch(() => undefined);
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

export function VariationsPopover(props: VariationsPopoverProps) {
	/**
	 * Read OUTSIDE the variations provider below — query state is a single nearest-provider
	 * context, so the products filter is unreachable from the popover's own subtree. The pill
	 * governs here exactly as it does in the expanded table: a colour leading only to variations
	 * outside the filter is greyed out. With the pill cleared every colour is selectable and the
	 * disabled Add to Cart button carries the stock news instead.
	 */
	const stockStatus = useQueryState<'products', string | undefined>(
		(state) => state.filters.stock_status
	);

	return (
		<QueryStateProvider
			collection="variations"
			initialPageSize={Number.MAX_SAFE_INTEGER}
			initialSort={{ field: 'name', direction: 'asc' }}
			initialFilters={{ status: 'publish' }}
		>
			<VariationsPopoverContent {...props} stockStatus={stockStatus} />
		</QueryStateProvider>
	);
}
