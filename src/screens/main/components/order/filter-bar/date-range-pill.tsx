import * as React from 'react';

import { ButtonGroup, Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/tailwind/src/popover';
import { Select, SelectContent, SelectItem, SelectPrimitive } from '@wcpos/tailwind/src/select';

import { DateRangeCalendar } from './calendar';
import { useT } from '../../../../../contexts/translations';

export const DateRangePill = () => {
	const t = useT();

	return (
		<ButtonGroup>
			<Select>
				<SelectPrimitive.Trigger asChild>
					<Button size="xs" className="rounded-full" leftIcon="calendarDays">
						<ButtonText>{t('Date Range', { _tags: 'core' })}</ButtonText>
					</Button>
				</SelectPrimitive.Trigger>
				<SelectContent>
					<SelectItem label="Apple" value="apple">
						Apple
					</SelectItem>
					<SelectItem label="Banana" value="banana">
						Banana
					</SelectItem>
					<SelectItem label="Blueberry" value="blueberry">
						Blueberry
					</SelectItem>
					<SelectItem label="Grapes" value="grapes">
						Grapes
					</SelectItem>
					<SelectItem label="Pineapple" value="pineapple">
						Pineapple
					</SelectItem>
				</SelectContent>
			</Select>
			<Popover>
				<PopoverTrigger asChild>
					<Button size="xs" className="rounded-full">
						<ButtonText>{t('Today', { _tags: 'core' })}</ButtonText>
					</Button>
				</PopoverTrigger>
				<PopoverContent side="bottom" className="w-auto">
					<DateRangeCalendar />
				</PopoverContent>
			</Popover>
			<Button className="rounded-full" size="xs" leftIcon="xmark" />
		</ButtonGroup>
	);
};
