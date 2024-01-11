import * as React from 'react';

import get from 'lodash/get';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import VariationsFilterBar from './filter-bar';
import Table from './table';

/**
 *
 */
const Variations = ({ item, initialSelectedAttributes, parentSearchTerm }) => {
	const parent = item.document;

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
	});

	/**
	 * initialSelectedAttributes can change when the user quick selects variation
	 * so we can't just use the initial value, we need to update the query
	 */
	React.useEffect(() => {
		const hasSelectedAttributes = get(query.getParams(), ['selector', 'attributes']);
		if (initialSelectedAttributes) {
			query.updateVariationAttributeSelector(initialSelectedAttributes);
		} else if (hasSelectedAttributes) {
			query.resetVariationAttributeSelector();
		}
	}, [initialSelectedAttributes, query]);

	/**
	 *
	 */
	return (
		<Box>
			<ErrorBoundary>
				<VariationsFilterBar parent={parent} query={query} parentSearchTerm={parentSearchTerm} />
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
