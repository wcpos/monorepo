import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';

import { t } from '../../../../../lib/translations';
import { useProducts } from '../../../contexts/products';

/**
 *
 */
const FeaturedPill = () => {
	const { query$, setQuery } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const isActive = get(query, 'selector.featured', false);

	return (
		<Pill
			icon="star"
			size="small"
			color={isActive ? 'primary' : 'lightGrey'}
			onPress={() => setQuery('selector.featured', isActive ? null : true)}
			removable={isActive}
			onRemove={() => setQuery('selector.featured', null)}
		>
			{t('Featured', { _tags: 'core' })}
		</Pill>
	);
};

export default FeaturedPill;
