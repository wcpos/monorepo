import * as React from 'react';

import Dropdown from '@wcpos/components/src/dropdown';
import Pill from '@wcpos/components/src/pill';
import Popover from '@wcpos/components/src/popover';
import type { ProductCollection } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { DateRangeCalendar } from './calendar';
import { useT } from '../../../../../contexts/translations';

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
export const DateRange = ({ query }: Props) => {
	const t = useT();
	const [dateField, setDateField] = React.useState('');
	const isActive = !!dateField;
	const [open, setOpen] = React.useState(false);

	/**
	 *
	 */
	const getLabel = React.useCallback(
		(id) => {
			switch (id) {
				case 'date_created_gmt':
					return t('Date Created', { _tags: 'core' });
				case 'date_completed_gmt':
					return t('Date Completed', { _tags: 'core' });
				case 'date_paid_gmt':
					return t('Date Paid', { _tags: 'core' });
			}
		},
		[t]
	);

	/**
	 *
	 */
	const label = React.useMemo(() => {
		if (!dateField) {
			return t('Date Range', { _tags: 'core' });
		}

		const label = getLabel(dateField);
		if (label) {
			return label;
		}

		return String(dateField);
	}, [getLabel, dateField, t]);

	/**
	 *
	 */
	const items = React.useMemo(() => {
		return [
			{
				label: getLabel('date_created_gmt'),
				value: 'date_created_gmt',
			},
			{
				label: getLabel('date_completed_gmt'),
				value: 'date_completed_gmt',
			},
			{
				label: getLabel('date_paid_gmt'),
				value: 'date_paid_gmt',
			},
		];
	}, [getLabel]);

	/**
	 *
	 */
	return (
		<>
			<Dropdown
				items={items}
				opened={open}
				onClose={() => setOpen(false)}
				withArrow={false}
				onSelect={(val) => setDateField(val)}
				placement="bottom-start"
			>
				<Pill
					icon="calendarDays"
					size="small"
					color={isActive ? 'primary' : 'lightGrey'}
					onPress={() => setOpen(true)}
					removable={isActive}
					onRemove={() => setDateField('')}
				>
					{label}
				</Pill>
			</Dropdown>
			<Popover opened>
				<Popover.Target>test</Popover.Target>
				<Popover.Content>
					<DateRangeCalendar />
				</Popover.Content>
			</Popover>
		</>
	);
};
