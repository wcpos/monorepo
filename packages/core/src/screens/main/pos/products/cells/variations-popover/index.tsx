import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import Variations from './variations';

/**
 *
 */
const VariationsPopover = ({ parent, addToCart }) => {
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
				query.removeWhere('attributes').exec();
			};
		},
		[
			// only run when the component unmounts
		]
	);

	return (
		<ErrorBoundary>
			<Suspense>
				<Variations query={query} parent={parent} addToCart={addToCart} />
			</Suspense>
		</ErrorBoundary>
	);
};

export default VariationsPopover;
