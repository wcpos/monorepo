import * as React from 'react';

import { utc } from '@date-fns/utc';
import { format } from 'date-fns';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

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
	const selectedDateRange = useObservableEagerState(
		query.params$.pipe(map(() => query.findSelector('date_created_gmt')))
	);

	/**
	 *
	 */
	const label = React.useMemo(() => {
		return 'hi';
	}, []);

	/**
	 *
	 */
	const handleDateSelect = React.useCallback(
		({ from, to }) => {
			query.where('date_created_gmt', {
				$gte: format(from, "yyyy-MM-dd'T'HH:mm:ss", { in: utc }),
				$lte: format(to, "yyyy-MM-dd'T'HH:mm:ss", { in: utc }),
			});

			if (triggerRef.current) {
				triggerRef.current?.close();
			}
		},
		[query]
	);

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
