import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { Variations } from './variations';
import { useUISettings } from '../../../../contexts/ui-settings';
import { QueryStateProvider, useCollectionBinding, useQueryState } from '../../../../../../query';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];

interface VariationsPopoverProps {
	parent: EngineRecord<'products'>;
	addToCart: (variation: EngineRecord<'variations'>, metaData: LineItem['meta_data']) => void;
}

/**
 *
 */
function VariationsPopoverContent({ parent, addToCart }: VariationsPopoverProps) {
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
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useDocField(uiSettings, (settings) => settings.showOutOfStock);

	return (
		<ErrorBoundary>
			<Suspense>
				<Variations
					binding={binding}
					allVariationsResource={allVariationsBinding.resource}
					parent={parent}
					addToCart={addToCart}
					hideOutOfStock={!showOutOfStock}
				/>
			</Suspense>
		</ErrorBoundary>
	);
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
