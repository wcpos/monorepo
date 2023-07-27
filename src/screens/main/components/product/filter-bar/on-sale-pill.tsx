import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Pill from '@wcpos/components/src/pill';

import { t } from '../../../../../lib/translations';
import { useProducts } from '../../../contexts/products';

const OnSalePill = () => {
	const { query } = useProducts();
	const isActive = useObservableState(
		query.state$.pipe(map((state) => get(state, ['selector', 'on_sale']))),
		get(query, ['currentState', 'selector', 'on_sale'])
	);

	return (
		<Pill
			icon="badgeDollar"
			size="small"
			color={isActive ? 'primary' : 'lightGrey'}
			onPress={() => query.where('on_sale', isActive ? null : true)}
			removable={isActive}
			onRemove={() => query.where('on_sale', null)}
		>
			{t('On Sale', { _tags: 'core' })}
		</Pill>
	);
};

export default OnSalePill;
