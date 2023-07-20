import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';

import { t } from '../../../../../lib/translations';
import { useProducts } from '../../../contexts/products';

const OnSalePill = () => {
	const { query$, setQuery } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const isActive = get(query, 'selector.on_sale', false);

	return (
		<Pill
			icon="badgeDollar"
			size="small"
			color={isActive ? 'primary' : 'lightGrey'}
			onPress={() => setQuery('selector.on_sale', isActive ? null : true)}
			removable={isActive}
			onRemove={() => setQuery('selector.on_sale', null)}
		>
			{t('On Sale', { _tags: 'core' })}
		</Pill>
	);
};

export default OnSalePill;
