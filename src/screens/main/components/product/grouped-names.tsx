import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import Text from '@wcpos/components/src/text';
import { useQuery } from '@wcpos/query';

/**
 *
 */
const GroupedNames = ({ query }) => {
	const data = useObservableSuspense(query.resource);
	const names = data.map((doc) => doc.name);

	return (
		<Text>
			<Text size="small" type="secondary">
				Grouped:{' '}
			</Text>
			<Text size="small">{names.join(', ')}</Text>
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
