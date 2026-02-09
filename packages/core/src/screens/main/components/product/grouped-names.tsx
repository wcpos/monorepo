import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import { useObservableSuspense } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useQuery } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
const GroupedNames = ({ query }: { query: ReturnType<typeof useQuery> }) => {
	const result = useObservableSuspense(query!.resource) as {
		hits: { document: { name?: string } }[];
	};
	const names = result.hits.map(({ document }: { document: { name?: string } }) => document.name);
	const t = useT();

	/**
	 * Sometimes the product name from WooCommerce is encoded in html entities
	 */
	return (
		<HStack className="flex-wrap gap-0">
			<Text className="text-muted-foreground text-xs">{`${t('common.grouped')}: `}</Text>
			<Text className="text-xs" decodeHtml>
				{names.join(', ')}
			</Text>
		</HStack>
	);
};

/**
 *
 */
const WrappedQuery = ({ row }: CellContext<{ document: ProductDocument }, 'name'>) => {
	const parent = row.original.document;

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['products', { target: 'grouped', parentID: parent.id }],
		collectionName: 'products',
		initialParams: {
			selector: {
				id: {
					$in: parent.grouped_products,
				},
			},
		},
	});

	return <GroupedNames query={query} />;
};

export default WrappedQuery;
