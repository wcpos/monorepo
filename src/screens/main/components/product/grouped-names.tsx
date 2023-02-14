import * as React from 'react';

import Text from '@wcpos/components/src/text';

import useProducts from '../../contexts/products';

const GroupedNames = () => {
	const { data } = useProducts();
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
