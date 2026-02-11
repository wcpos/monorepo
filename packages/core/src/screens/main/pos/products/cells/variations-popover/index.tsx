import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { useQuery } from '@wcpos/query';

import { Variations } from './variations';

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
export function VariationsPopover({ parent, addToCart }: VariationsPopoverProps) {
	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['variations', { parentID: parent.id }],
		collectionName: 'variations',
		initialParams: {
			selector: { id: { $in: parent.variations } },
		},
		endpoint: `products/${parent.id}/variations`,
		greedy: true,
	});

	/**
	 * Clear the query when the popover closes
	 */
	React.useEffect(
		() => {
			return () => {
				query?.removeWhere('attributes').exec();
			};
		},
		[
			// only run when the component unmounts
		]
	);

	if (!query) return null;

	return (
		<ErrorBoundary>
			<Suspense>
				<Variations query={query} parent={parent} addToCart={addToCart} />
			</Suspense>
		</ErrorBoundary>
	);
}
