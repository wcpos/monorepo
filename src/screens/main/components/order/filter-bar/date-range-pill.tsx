import * as React from 'react';

import { Button, ButtonText, ButtonGroupSeparator } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/src/popover';
import { Select, SelectContent, SelectItem, SelectPrimitive } from '@wcpos/components/src/select';

import { DateRangeCalendar } from './calendar';
import { useT } from '../../../../../contexts/translations';

export const DateRangePill = () => {
	const t = useT();

	return (
		<HStack className="gap-0">
			<Select>
				<SelectPrimitive.Trigger asChild>
					<Button size="xs" className="rounded-full pr-2 rounded-r-none" leftIcon="calendarDays">
						<ButtonText>{t('Date Range', { _tags: 'core' })}</ButtonText>
					</Button>
				</SelectPrimitive.Trigger>
				<SelectContent>
					<SelectItem label={t('Date Created', { _tags: 'core' })} value="date_created_gmt">
						{t('Date Created', { _tags: 'core' })}
					</SelectItem>
					<SelectItem label={t('Date Completed', { _tags: 'core' })} value="date_completed_gmt">
						{t('Date Completed', { _tags: 'core' })}
					</SelectItem>
					<SelectItem label={t('Date Paid', { _tags: 'core' })} value="date_paid_gmt">
						{t('Date Paid', { _tags: 'core' })}
					</SelectItem>
				</SelectContent>
			</Select>
			<ButtonGroupSeparator />
			<Popover>
				<PopoverTrigger asChild>
					<Button size="xs" className="px-2 rounded-none">
						<ButtonText>{t('Today', { _tags: 'core' })}</ButtonText>
					</Button>
				</PopoverTrigger>
				<PopoverContent side="bottom" className="w-auto">
					<DateRangeCalendar />
				</PopoverContent>
			</Popover>
			<ButtonGroupSeparator />
			<Button className="rounded-full pl-2 rounded-l-none" size="xs" leftIcon="xmark" />
		</HStack>
	);
};
