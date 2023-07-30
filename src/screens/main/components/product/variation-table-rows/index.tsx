import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';

import VariationsFilterBar from './filter-bar';
import Table from './table';
import { useQuery } from '../../../../../contexts/store-state-manager';

/**
 *
 */
const Variations = ({ parent }) => {
	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['variations', { parentID: parent.id }],
		collectionName: 'variations',
		initialQuery: {
			selector: { id: { $in: parent.variations } },
		},
		apiEndpoint: `products/${parent.id}/variations`,
		remoteIDs: parent.variations,
	});

	/**
	 *
	 */
	return (
		<Box>
			<ErrorBoundary>
				<VariationsFilterBar parent={parent} />
			</ErrorBoundary>
			<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
				<Suspense>
					<Table parent={parent} query={query} />
				</Suspense>
			</Box>
		</Box>
	);
};

export default Variations;
