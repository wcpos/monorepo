import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import VariationsFilterBar from './filter-bar';
import Table from './table';

/**
 *
 */
const Variations = ({ parent, initialSearch }) => {
	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['variations', { parentID: parent.id }],
		collectionName: 'variations',
		initialParams: {
			selector: { id: { $in: parent.variations } },
			// search: { attributes: [initialSearch] },
		},
		endpoint: `products/${parent.id}/variations`,
	});

	/**
	 *
	 */
	React.useEffect(() => {
		if (initialSearch) {
			query.search({ attributes: [initialSearch] });
		} else {
			query.search({});
		}
	}, [initialSearch, query]);

	/**
	 *
	 */
	return (
		<Box>
			<ErrorBoundary>
				<VariationsFilterBar parent={parent} />
			</ErrorBoundary>
			<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
				<ErrorBoundary>
					<Suspense>
						<Table parent={parent} query={query} />
					</Suspense>
				</ErrorBoundary>
			</Box>
		</Box>
	);
};

export default Variations;
