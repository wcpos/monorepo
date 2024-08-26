import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import { useObservableSuspense } from 'observable-hooks';

import { useQuery } from '@wcpos/query';
import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../../contexts/translations';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
const GroupedNames = ({ query }) => {
	const result = useObservableSuspense(query.resource);
	const names = result.hits.map(({ document }) => document.name);
	const t = useT();

	return (
		<Text>
			<Text className="text-sm text-muted-foreground">{`${t('Grouped', { _tags: 'core' })}: `}</Text>
			<Text className="text-sm">{names.join(', ')}</Text>
		</Text>
	);
};

/**
 *
 */
const WrappedQuery = ({ row }: CellContext<ProductDocument, 'name'>) => {
	const parent = row.original;

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
