import * as React from 'react';

import Pill from '@wcpos/components/src/pill';

import { t } from '../../../../../lib/translations';

interface FeaturedPillProps {
	active: boolean;
	setQuery: (key: string, value: boolean) => void;
}

const FeaturedPill = ({ active, setQuery }: FeaturedPillProps) => {
	return (
		<Pill
			icon="star"
			size="small"
			color={active ? 'primary' : 'lightGrey'}
			onPress={() => setQuery('selector.featured', active ? null : true)}
			removable={active}
			onRemove={() => setQuery('selector.featured', null)}
		>
			{t('Featured', { _tags: 'core' })}
		</Pill>
	);
};

export default FeaturedPill;
