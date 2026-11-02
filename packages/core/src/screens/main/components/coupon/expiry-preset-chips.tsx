import * as React from 'react';

import { Chip } from '@wcpos/components/chip';
import { HStack } from '@wcpos/components/hstack';

import { DatePickerInput } from './date-picker-input';
import { expiryPresetToDate } from './expiry-presets';
import { useStoreDay } from '../../../../hooks/use-store-day';
import { useT } from '../../../../contexts/translations';

import type { ExpiryPreset } from './expiry-presets';

interface ExpiryPresetChipsProps {
	value: string | null | undefined;
	onChange: (value: string | null) => void;
}

export function ExpiryPresetChips({ value, onChange }: ExpiryPresetChipsProps) {
	const t = useT();
	const { timezone } = useStoreDay();
	const hasDate = !!value;

	const presets: { key: ExpiryPreset; label: string }[] = [
		{ key: 'end_of_day', label: t('coupons.end_of_day') },
		{ key: 'one_week', label: t('coupons.one_week') },
		{ key: 'one_month', label: t('coupons.one_month') },
	];

	return (
		<HStack className="flex-wrap gap-2">
			<Chip
				label={t('coupons.never_expires')}
				on={!hasDate}
				onPress={() => onChange(null)}
				testID="coupon-expiry-never"
			/>
			{presets.map((preset) => (
				<Chip
					key={preset.key}
					label={preset.label}
					// A preset reads as picked while the field holds the date it sets today.
					on={value === expiryPresetToDate(preset.key, timezone)}
					onPress={() => onChange(expiryPresetToDate(preset.key, timezone))}
					testID={`coupon-expiry-${preset.key}`}
				/>
			))}
			<DatePickerInput value={value ?? null} onChange={onChange} label={t('coupons.pick_a_date')} />
		</HStack>
	);
}
