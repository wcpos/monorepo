import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import VariationsFilterBar from './filter-bar';
import Table from './table';
import { useProducts } from '../../../contexts/products';
import { Query } from '../../../contexts/query';
import { VariationsProvider } from '../../../contexts/variations';

/**
 *
 */
const Variations = ({ parent }) => {
	const { query: productQuery } = useProducts();
	const { sortBy, sortDirection } = useObservableState(
		productQuery.state$,
		productQuery.currentState
	);

	/**
	 *
	 */
	const variationsQuery = React.useMemo(() => {
		return new Query({
			selector: { $and: [{ id: { $in: parent.variations } }] },
			sortBy: sortBy === 'name' ? 'id' : sortBy,
			sortDirection,
		});
	}, [parent.variations, sortBy, sortDirection]);

	/**
	 *
	 */
	return (
		<VariationsProvider
			query={variationsQuery}
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
