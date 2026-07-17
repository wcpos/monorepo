import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';

import { Variations } from './variations';
import { useUISettings } from '../../../../contexts/ui-settings';
import { QueryStateProvider, useCollectionBinding, useQueryState } from '../../../../../../query';

type ProductDocument = import('@wcpos/database').ProductDocument;
type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];

interface VariationsPopoverProps {
	parent: ProductDocument;
	addToCart: (variation: ProductDocument, metaData: LineItem['meta_data']) => void;
}

/**
 *
 */
function VariationsPopoverContent({ parent, addToCart }: VariationsPopoverProps) {
	const state = useQueryState<'variations'>();
	const binding = useCollectionBinding('variations', state, {
		wooIds: parent.variations ?? [],
	});
	const allVariationsState = React.useMemo(
		() => ({
			...state,
			filters: { ...state.filters, attributeMatches: [] },
		}),
		[state]
	);
	const allVariationsBinding = useCollectionBinding('variations', allVariationsState, {
		wooIds: parent.variations ?? [],
	});
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useObservableEagerState(uiSettings.showOutOfStock$);

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
		>
			<VariationsPopoverContent {...props} />
		</QueryStateProvider>
	);
}
