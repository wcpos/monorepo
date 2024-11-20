import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import type { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
const OnSalePill = ({ query }: Props) => {
	const isActive = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('on_sale')))
	);
	const t = useT();

	return (
		<ButtonPill
			leftIcon="badgeDollar"
			size="xs"
			variant={isActive ? 'default' : 'muted'}
			onPress={() => query.where('on_sale').equals(true).exec()}
			removable={isActive}
			onRemove={() => query.removeWhere('on_sale').exec()}
		>
			<ButtonText>{t('On Sale', { _tags: 'core' })}</ButtonText>
		</ButtonPill>
	);
};

export default OnSalePill;
