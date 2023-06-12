import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import useProducts from '../../contexts/products';

const GroupedNames = () => {
	const { resource } = useProducts();
	const { data } = useObservableSuspense(resource);
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

export default GroupedNames;
