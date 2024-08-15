import * as React from 'react';
import { View } from 'react-native';

import { useQuery } from '@wcpos/query';
import type { Row } from '@wcpos/tailwind/src/data-table';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { IconButton } from '@wcpos/tailwind/src/icon-button';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import { VStack } from '@wcpos/tailwind/src/vstack';

// import { VariationsFilterBar } from './filter-bar';
import { VariationsTable } from './table';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface Props {
	row: Row<ProductDocument>;
	onLayout: (event: any) => void;
}

/**
 *
 */
export const Variations = ({ row, onLayout }: Props) => {
	const parent = row.original;

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
		<VStack onLayout={onLayout} className="gap-0">
			<ErrorBoundary>
				<HStack className="p-2 bg-input">
					<HStack className="flex-1"></HStack>
					<IconButton name="chevronUp" onPress={() => row.toggleExpanded()} />
				</HStack>
				{/* <VariationsFilterBar parent={parent} query={query} parentSearchTerm={parentSearchTerm} /> */}
			</ErrorBoundary>
			<View className="flex-1">
				<ErrorBoundary>
					<Suspense>
						<VariationsTable row={row} query={query} />
					</Suspense>
				</ErrorBoundary>
			</View>
		</VStack>
	);
};
