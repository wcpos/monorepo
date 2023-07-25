import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import { useVariationTable } from './context';
import VariationsFilterBar from './filter-bar';
import Table from './table';
import { VariationsProvider } from '../../../contexts/variations';

/**
 *
 */
const Variations = ({ parent }) => {
	const { query } = useVariationTable();

	/**
	 *
	 */
	return (
		<VariationsProvider
			query={query}
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
