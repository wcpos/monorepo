import * as React from 'react';

import { decode } from 'html-entities';

import { Chip } from '@wcpos/components/chip';

import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions } from '../../../../../query';

/**
 *
 */
export function FeaturedPill() {
	const isActive = useQueryState<'products', boolean>((state) => !!state.filters.featured);
	const actions = useQueryStateActions<'products'>();
	const t = useT();

	return (
		<Chip
			icon="star"
			on={isActive}
			onPress={() => actions.setFilter('featured', true)}
			testID="filter-pill-featured"
			clearTestID="filter-pill-remove-featured"
			onClear={isActive ? () => actions.clearFilter('featured') : undefined}
			clearLabel={t('common.remove')}
			label={decode(t('common.featured'))}
		/>
	);
}
