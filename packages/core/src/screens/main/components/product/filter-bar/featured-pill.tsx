import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonText, ButtonPill } from '@wcpos/components/src/button';
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
			variant={isActive ? 'default' : 'muted'}
			onPress={() => query.where('featured').equals(true).exec()}
			removable={isActive}
			onRemove={() => query.removeWhere('featured').exec()}
		>
			<ButtonText>{t('Featured', { _tags: 'core' })}</ButtonText>
		</ButtonPill>
	);
};

export default FeaturedPill;
