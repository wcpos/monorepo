import * as React from 'react';
import { View } from 'react-native';

import { useQuery } from '@wcpos/query';
import type { Row } from '@wcpos/tailwind/src/data-table';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import { VStack } from '@wcpos/tailwind/src/vstack';

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
				<VariationsFilterBar row={row} />
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
