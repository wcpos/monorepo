import * as React from 'react';
import { View } from 'react-native';

import type { Row } from '@wcpos/components/src/data-table';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import { VStack } from '@wcpos/components/src/vstack';
import { useQuery } from '@wcpos/query';

import { VariationsFilterBar } from './filters';
import { VariationsTable } from './table';
import { useVariationRow } from '../context';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface Props {
	row: Row<{ document: ProductDocument }>;
	onLayout: (event: any) => void;
}

/**
 *
 */
export const Variations = ({ row, onLayout }: Props) => {
	const parent = row.original.document;
	const { queryParams } = useVariationRow();

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['variations', { parentID: parent.id }],
		collectionName: 'variations',
		initialParams: {
			// search: row.original?.parentSearchTerm ? row.original.parentSearchTerm : null,
			selector: {
				$and: [
					{ id: { $in: parent.variations } },
					{ attributes: queryParams?.attributes ? queryParams?.attributes : null },
				],
			},
		},
		endpoint: `products/${parent.id}/variations`,
		greedy: true,
	});

	/**
	 *
	 */
	React.useEffect(() => {
		query.collection
			.find({
				selector: {
					$and: [
						{ id: { $in: parent.variations } },
						{
							$or: [
								{
									attributes: {
										$not: {
											$elemMatch: {
												id: 1,
												name: 'Color',
											},
										},
									},
								},
								{
									attributes: {
										$elemMatch: {
											id: 1,
											name: 'Color',
											option: 'Green',
										},
									},
								},
							],
						},
						{
							$or: [
								{
									attributes: {
										$not: {
											$elemMatch: {
												id: 2,
												name: 'Size',
											},
										},
									},
								},
								{
									attributes: {
										$elemMatch: {
											id: 2,
											name: 'Size',
											option: 'Large',
										},
									},
								},
							],
						},
					],
				},
			})
			.exec()
			.then((result) => {
				debugger;
				console.log('result', result);
			});
	}, [parent.variations, query]);

	/**
	 * Clear the query when the table unmounts
	 */
	React.useEffect(() => {
		return () => {
			query.where('attributes', null);
		};
	}, [query]);

	/**
	 * Update the search query when the parent search term changes
	 */
	React.useEffect(() => {
		if (row.original?.parentSearchTerm) {
			query.search(row.original.parentSearchTerm);
		} else {
			query.search('');
		}
	}, [query, row.original]);

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
