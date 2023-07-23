import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import VariationsFilterBar from './filter-bar';
import Table from './table';
import { useProducts } from '../../../contexts/products';
import { VariationsProvider } from '../../../contexts/variations';

/**
 *
 */
const Variations = ({ parent }) => {
	const { query$ } = useProducts();

	/**
	 *
	 */
	const initialQuery = React.useMemo(() => {
		const query = query$.getValue();
		return {
			selector: { $and: [{ id: { $in: parent.variations } }] },
			sortBy: query.sortBy === 'name' ? 'id' : query.sortBy,
			sortDirection: query.sortDirection,
		};
	}, [parent.variations, query$]);

	/**
	 *
	 */
	return (
		<VariationsProvider
			initialQuery={initialQuery}
			apiEndpoint={`products/${parent.id}/variations`}
			remoteIDs={parent.variations}
		>
			<Box>
				<ErrorBoundary>
					<VariationsFilterBar parent={parent} />
				</ErrorBoundary>
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
					<React.Suspense>
						<Table parent={parent} />
					</React.Suspense>
				</Box>
			</Box>
		</VariationsProvider>
	);
};

export default Variations;
