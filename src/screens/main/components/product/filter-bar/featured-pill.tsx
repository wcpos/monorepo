import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Pill from '@wcpos/components/src/pill';
import { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
const FeaturedPill = ({ query }: Props) => {
	const isActive = useObservableState(
		query.params$.pipe(map((params) => get(params, ['selector', 'featured']))),
		get(query.getParams(), ['selector', 'featured'])
	);
	const t = useT();

	return (
		<Pill
			icon="star"
			size="small"
			color={isActive ? 'primary' : 'lightGrey'}
			onPress={() => query.where('featured', isActive ? null : true)}
			removable={isActive}
			onRemove={() => query.where('featured', null)}
		>
			{t('Featured', { _tags: 'core' })}
		</Pill>
	);
};

export default FeaturedPill;
