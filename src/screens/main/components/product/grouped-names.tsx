import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { useQuery } from '@wcpos/query';
import { Text } from '@wcpos/tailwind/src/text';

import { useT } from '../../../../contexts/translations';

/**
 *
 */
const GroupedNames = ({ query }) => {
	const result = useObservableSuspense(query.resource);
	const names = result.hits.map(({ document }) => document.name);
	const t = useT();

	return (
		<Text>
			<Text className="text-sm text-muted">{`${t('Grouped', { _tags: 'core' })}: `}</Text>
			<Text className="text-sm">{names.join(', ')}</Text>
		</Text>
	);
};

/**
 *
 */
const WrappedQuery = ({ parent }) => {
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
