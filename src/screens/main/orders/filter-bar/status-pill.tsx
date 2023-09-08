import * as React from 'react';

import Pill from '@wcpos/components/src/pill';

import { useT } from '../../../../contexts/translations';

interface StatusPillProps {
	active: boolean;
	setQuery: (key: string, value: boolean) => void;
}

const StatusPill = ({ active, setQuery }: StatusPillProps) => {
	const t = useT();

	return (
		<Pill
			icon="circle"
			size="small"
			color={active ? 'primary' : 'lightGrey'}
			onPress={() => setQuery('selector.status', !active)}
			removable={active}
			onRemove={() => setQuery('selector.status', false)}
		>
			{t('Select Status', { _tags: 'core' })}
		</Pill>
	);
};

export default StatusPill;
