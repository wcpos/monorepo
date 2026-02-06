import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import type { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
const FeaturedPill = ({ query }: Props) => {
	const isActive = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('featured')))
	);
	const t = useT();

	return (
		<ButtonPill
			leftIcon="star"
			size="xs"
			variant={isActive ? undefined : 'muted'}
			onPress={() => query.where('featured').equals(true).exec()}
			removable={isActive}
			onRemove={() => query.removeWhere('featured').exec()}
		>
			<ButtonText>{t('common.featured')}</ButtonText>
		</ButtonPill>
	);
};

export default FeaturedPill;
