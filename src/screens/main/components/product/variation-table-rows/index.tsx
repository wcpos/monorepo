import * as React from 'react';
import { View } from 'react-native';

import { useQuery } from '@wcpos/query';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import { VStack } from '@wcpos/components/src/vstack';

import { VariationsFilterBar } from './filter-bar';
import Table from './table';

/**
 *
 */
const Variations = ({ item, parentSearchTerm }) => {
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
	 *
	 */
	return (
		<VStack>
			<ErrorBoundary>
				{/* <VariationsFilterBar parent={parent} query={query} parentSearchTerm={parentSearchTerm} /> */}
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
