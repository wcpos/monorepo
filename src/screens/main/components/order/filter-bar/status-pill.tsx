import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Dropdown from '@wcpos/components/src/dropdown';
import Pill from '@wcpos/components/src/pill';
import type { ProductCollection } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useOrderStatusLabel } from '../../../hooks/use-order-status-label';

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
const StatusPill = ({ query }: Props) => {
	const selected = useObservableState(
		query.params$.pipe(map(() => query.findSelector('status'))),
		query.findSelector('status')
	) as string | undefined;
	const t = useT();
	const isActive = !!selected;
	const [open, setOpen] = React.useState(false);
	const { items, getLabel } = useOrderStatusLabel();

	/**
	 *
	 */
	const label = React.useMemo(() => {
		if (!selected) {
			return t('Select Status', { _tags: 'core' });
		}

		const label = getLabel(selected);
		if (label) {
			return label;
		}

		return String(selected);
	}, [getLabel, selected, t]);

	return (
		<Dropdown
			items={items}
			opened={open}
			onClose={() => setOpen(false)}
			withArrow={false}
			onSelect={(val) => query.where('status', val)}
			placement="bottom-start"
		>
			<Pill
				icon="cartCircleCheck"
				size="small"
				color={isActive ? 'primary' : 'lightGrey'}
				onPress={() => setOpen(true)}
				removable={isActive}
				onRemove={() => query.where('status', null)}
			>
				{label}
			</Pill>
		</Dropdown>
	);
};

export default StatusPill;
