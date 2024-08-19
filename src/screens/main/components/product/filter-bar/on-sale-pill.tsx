import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import type { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';

import { useT } from '../../../../../contexts/translations';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
const OnSalePill = ({ query }: Props) => {
	const isActive = useObservableState(
		query.params$.pipe(map(() => query.findSelector('on_sale'))),
		query.findSelector('on_sale')
	);
	const t = useT();

	return (
		<ButtonPill
			leftIcon="badgeDollar"
			size="xs"
			variant={isActive ? 'default' : 'muted'}
			onPress={() => query.where('on_sale', isActive ? null : true)}
			removable={isActive}
			onRemove={() => query.where('on_sale', null)}
		>
			<ButtonText>{t('On Sale', { _tags: 'core' })}</ButtonText>
		</ButtonPill>
	);
};

export default OnSalePill;
