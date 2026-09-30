import * as React from 'react';

import { decode } from 'html-entities';

import { Chip } from '@wcpos/components/chip';

import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions } from '../../../../../query';

/**
 *
 */
export function OnSalePill() {
	const isActive = useQueryState<'products', boolean>((state) => !!state.filters.on_sale);
	const actions = useQueryStateActions<'products'>();
	const t = useT();

	return (
		<Chip
			icon="badgeDollar"
			on={isActive}
			onPress={() => actions.setFilter('on_sale', true)}
			testID="filter-pill-on_sale"
			clearTestID="filter-pill-remove-on_sale"
			onClear={isActive ? () => actions.clearFilter('on_sale') : undefined}
			clearLabel={t('common.remove')}
			label={decode(t('common.on_sale'))}
		/>
	);
}
