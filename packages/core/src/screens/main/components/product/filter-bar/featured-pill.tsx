import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';

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
		<ButtonPill
			leftIcon="star"
			size="xs"
			variant={isActive ? undefined : 'muted'}
			onPress={() => actions.setFilter('featured', true)}
			removable={isActive}
			removeTestID="filter-pill-remove-featured"
			onRemove={() => actions.clearFilter('featured')}
		>
			<ButtonText>{t('common.featured')}</ButtonText>
		</ButtonPill>
	);
}
