import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import type { Query } from '@wcpos/query';
import { ButtonText, ButtonPill } from '@wcpos/tailwind/src/button';

import { useT } from '../../../../../contexts/translations';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
const FeaturedPill = ({ query }: Props) => {
	const isActive = useObservableState(
		query.params$.pipe(map(() => query.findSelector('featured'))),
		query.findSelector('featured')
	);
	const t = useT();

	return (
		<ButtonPill
			leftIcon="star"
			size="xs"
			variant={isActive ? 'default' : 'secondary'}
			onPress={() => query.where('featured', isActive ? null : true)}
			removable={isActive}
			onRemove={() => query.where('featured', null)}
		>
			<ButtonText>{t('Featured', { _tags: 'core' })}</ButtonText>
		</ButtonPill>
	);
};

export default FeaturedPill;
