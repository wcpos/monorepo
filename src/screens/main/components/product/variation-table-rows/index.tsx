import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';

import { useQuery } from '@wcpos/query';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import { VStack } from '@wcpos/tailwind/src/vstack';

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
		greedy: true,
	});

	/**
	 * initialSelectedAttributes can change when the user quick selects variation
	 * so we can't just use the initial value, we need to update the query
	 */
	// React.useEffect(() => {
	// 	const hasSelectedAttributes = get(query.getParams(), ['selector', 'attributes']);
	// 	if (initialSelectedAttributes) {
	// 		query.updateVariationAttributeSelector(initialSelectedAttributes);
	// 	} else if (hasSelectedAttributes) {
	// 		query.resetVariationAttributeSelector();
	// 	}
	// }, [initialSelectedAttributes, query]);

	/**
	 *
	 */
	return (
		<VStack>
			<ErrorBoundary>
				<VariationsFilterBar parent={parent} query={query} parentSearchTerm={parentSearchTerm} />
			</ErrorBoundary>
			<View className="flex-1">
				<ErrorBoundary>
					<Suspense>
						<Table parent={parent} query={query} />
					</Suspense>
				</ErrorBoundary>
			</View>
		</VStack>
	);
};

export default Variations;
