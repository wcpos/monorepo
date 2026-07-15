import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';

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
		<ButtonPill
			leftIcon="badgeDollar"
			size="xs"
			variant={isActive ? undefined : 'muted'}
			onPress={() => actions.setFilter('on_sale', true)}
			removable={isActive}
			onRemove={() => actions.clearFilter('on_sale')}
		>
			<ButtonText>{t('common.on_sale')}</ButtonText>
		</ButtonPill>
	);
}
