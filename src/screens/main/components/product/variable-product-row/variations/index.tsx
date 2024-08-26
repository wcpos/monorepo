import * as React from 'react';
import { View } from 'react-native';

import { useQuery } from '@wcpos/query';
import type { Row } from '@wcpos/components/src/data-table';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import { VStack } from '@wcpos/components/src/vstack';

import { VariationsFilterBar } from './filters';
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
				<VariationsFilterBar row={row} query={query} />
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
