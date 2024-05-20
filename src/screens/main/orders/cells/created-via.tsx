import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';

import { useT } from '../../../../contexts/translations';

type Props = {
	item: import('@wcpos/database').OrderDocument;
};

const iconMap = {
	'woocommerce-pos': {
		name: 'wcpos',
		type: 'secondary',
	},
	admin: {
		name: 'wordpress',
		type: 'secondary',
	},
	checkout: {
		name: 'globe',
		type: 'secondary',
	},
};

/**
 *
 */
export const CreatedVia = ({ item: order }: Props) => {
	const createdVia = useObservableEagerState(order.created_via$);
	const iconName = get(iconMap, [createdVia, 'name'], 'circleQuestion');
	const iconType = get(iconMap, [createdVia, 'type'], 'secondary');
	const t = useT();

	/**
	 * @TODO - add store name for Pro
	 */
	const label = React.useMemo(() => {
		switch (createdVia) {
			case 'woocommerce-pos':
				return t('POS Store', { _tags: 'core' });
			case 'admin':
				return t('WP Admin', { _tags: 'core' });
			case 'checkout':
				return t('Online Store', { _tags: 'core' });
			default:
				return createdVia || t('Unknown', { _tags: 'core' });
		}
	}, [createdVia, t]);

	/**
	 *
	 */
	return <Icon name={iconName} type={iconType} tooltip={label} tooltipPlacement="top" />;
};
