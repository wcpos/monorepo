import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Pill from '@wcpos/components/src/pill';

import { useStoreStateManager } from '../../../../../contexts/store-state-manager';
import { t } from '../../../../../lib/translations';

/**
 *
 */
const FeaturedPill = () => {
	const manager = useStoreStateManager();
	const query = manager.getQuery(['products']);
	const isActive = useObservableState(
		query.state$.pipe(map((state) => get(state, ['selector', 'featured']))),
		get(query, ['currentState', 'selector', 'featured'])
	);

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
