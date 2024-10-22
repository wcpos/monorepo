import * as React from 'react';

import { utc } from '@date-fns/utc';
import { format } from 'date-fns';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/src/popover';
import type { OrderCollection } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { DateRangeCalendar } from './calendar';
import { useT } from '../../../../../contexts/translations';

interface Props {
	query: Query<OrderCollection>;
}

export const DateRangePill = ({ query }: Props) => {
	const t = useT();
	const isActive = false;
	const triggerRef = React.useRef(null);

	/**
	 *
	 */
	const label = React.useMemo(() => {
		return 'hi';
	}, []);

	/**
	 *
	 */
	const handleDateSelect = React.useCallback(({ from, to }) => {
		console.log('from', from);
		console.log('to', to);
		console.log('from', format(from, "yyyy-MM-dd'T'HH:mm:ss", { in: utc }));
		console.log('to', format(to, "yyyy-MM-dd'T'HH:mm:ss", { in: utc }));

		if (triggerRef.current) {
			triggerRef.current?.close();
		}
	}, []);

	return (
		<Popover>
			<PopoverTrigger ref={triggerRef} asChild>
				<ButtonPill
					size="xs"
					leftIcon="calendarDays"
					variant={isActive ? 'default' : 'muted'}
					removable={isActive}
					onRemove={() => {
						// remove range query
					}}
				>
					<ButtonText>{isActive ? label : t('Date Range', { _tags: 'core' })}</ButtonText>
				</ButtonPill>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-2">
				<DateRangeCalendar onSelect={handleDateSelect} />
			</PopoverContent>
		</Popover>
	);
};
