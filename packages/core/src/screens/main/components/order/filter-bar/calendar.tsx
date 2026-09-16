import * as React from 'react';

import { format, parseISO } from 'date-fns';
import { tz } from '@date-fns/tz';

import { Button, ButtonPill, ButtonText } from '@wcpos/components/button';
import { Calendar, DateRange } from '@wcpos/components/calendar';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';
import { useLocale } from '@wcpos/core/hooks/use-locale';

import { useStoreDay } from '../../../../../hooks/use-store-day';
import { useT } from '../../../../../contexts/translations';

interface Props {
	onSelect: (date: DateRange) => void;
}

/**
 * Utility function to compare two date ranges
 */
const isDateRangeEqual = (range1: DateRange | undefined, range2: DateRange) => {
	return (
		range1?.from.getTime() === range2.from.getTime() && range1?.to.getTime() === range2.to.getTime()
	);
};

/**
 * DateRangeCalendar Component
 */
export function DateRangeCalendar({ onSelect }: Props) {
	const t = useT();
	const { timezone, presets } = useStoreDay();
	const { shortCode } = useLocale();
	// The picker and its consumers exchange device-local calendar dates, not instants.
	const ranges = React.useMemo(
		() =>
			Object.values(presets()).map(({ from, to }) => ({
				from: parseISO(format(from, 'yyyy-MM-dd', { in: tz(timezone) })),
				to: parseISO(format(to, 'yyyy-MM-dd', { in: tz(timezone) })),
			})),
		[presets, timezone]
	);
	const [date, setDate] = React.useState<DateRange | undefined>(ranges[0]);
	const labels = [
		t('common.today'),
		t('common.yesterday'),
		t('common.this_week'),
		t('common.last_week'),
		t('common.this_month'),
		t('common.last_month'),
	];
	const dateRanges = ranges.map((range, index) => ({
		label: labels[index],
		range,
		action: () => setDate(range),
	}));

	/**
	 * Handle date range change from the Calendar component
	 */
	const handleDateRangeChange = (range: DateRange) => {
		setDate(range);
	};

	return (
		<VStack>
			<HStack className="items-start">
				<VStack>
					{dateRanges.map(({ label, range, action }) => (
						<ButtonPill
							key={label}
							onPress={action}
							size="xs"
							variant={isDateRangeEqual(date, range) ? undefined : 'ghost-primary'}
						>
							<ButtonText>{label}</ButtonText>
						</ButtonPill>
					))}
				</VStack>
				<Calendar
					maxDate={format(ranges[0].from, 'yyyy-MM-dd')}
					dateRange={date}
					onDateRangeChange={handleDateRangeChange}
					locale={shortCode}
				/>
			</HStack>
			<HStack className="justify-end">
				<Button onPress={() => date && onSelect(date)}>
					<ButtonText>{t('common.done')}</ButtonText>
				</Button>
			</HStack>
		</VStack>
	);
}
