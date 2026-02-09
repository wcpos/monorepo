import * as React from 'react';
import { View } from 'react-native';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';
import { useQuery } from '@wcpos/query';

import { VariationsFilterBar } from './filters';
import { VariationsTable } from './table';
import { useVariationRow } from '../context';

import type { Row } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface Props {
	row: Row<{ document: ProductDocument }>;
}

/**
 *
 */
export const Variations = ({ row }: Props) => {
	const parent = row.original.document;
	const { queryParams, updateQueryParams } = useVariationRow();

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['variations', { parentID: parent.id }],
		collectionName: 'variations',
		initialParams: {
			// search: row.original?.parentSearchTerm ? row.original.parentSearchTerm : null,
			selector: {
				id: { $in: parent.variations },
			},
			sort: [{ name: 'asc' }],
		},
		endpoint: `products/${parent.id}/variations`,
		greedy: true,
	});

	/**
	 * Apply the variation match filter from the Variable Product Row context
	 */
	React.useEffect(() => {
		if (queryParams?.attribute) {
			query?.variationMatch(queryParams.attribute).exec();
		}
		if (queryParams?.search) {
			query?.search(queryParams.search);
		}
	}, [query, queryParams]);

	/**
	 * Clear the query when the table unmounts
	 */
	React.useEffect(
		() => {
			return () => {
				query?.search('');
				updateQueryParams('search', null);
				query?.removeWhere('attributes').exec();
				updateQueryParams('attribute', null);
			};
		},
		[
			// only run when the component unmounts
		]
	);

	/**
	 *
	 */
	return (
		<VStack className="gap-0">
			<ErrorBoundary>
				<VariationsFilterBar row={row} query={query!} />
			</ErrorBoundary>
			<View className="flex-1">
				<ErrorBoundary>
					<Suspense>
						<VariationsTable row={row} query={query!} />
					</Suspense>
				</ErrorBoundary>
			</View>
		</VStack>
	);
};
