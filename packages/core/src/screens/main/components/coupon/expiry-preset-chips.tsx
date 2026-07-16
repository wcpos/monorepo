import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';

import { DatePickerInput } from './date-picker-input';
import { expiryPresetToDate } from './expiry-presets';
import { useT } from '../../../../contexts/translations';

import type { ExpiryPreset } from './expiry-presets';

interface ExpiryPresetChipsProps {
	value: string | null | undefined;
	onChange: (value: string | null) => void;
}

export function ExpiryPresetChips({ value, onChange }: ExpiryPresetChipsProps) {
	const t = useT();
	const hasDate = !!value;

	const presets: { key: ExpiryPreset; label: string }[] = [
		{ key: 'end_of_day', label: t('coupons.end_of_day') },
		{ key: 'one_week', label: t('coupons.one_week') },
		{ key: 'one_month', label: t('coupons.one_month') },
	];

	return (
		<HStack className="flex-wrap gap-2">
			<ButtonPill
				size="sm"
				variant={hasDate ? 'muted' : 'default'}
				onPress={() => onChange(null)}
				testID="coupon-expiry-never"
			>
				<ButtonText>{t('coupons.never_expires')}</ButtonText>
			</ButtonPill>
			{presets.map((preset) => (
				<ButtonPill
					key={preset.key}
					size="sm"
					variant="muted"
					onPress={() => onChange(expiryPresetToDate(preset.key))}
					testID={`coupon-expiry-${preset.key}`}
				>
					<ButtonText>{preset.label}</ButtonText>
				</ButtonPill>
			))}
			<DatePickerInput value={value ?? null} onChange={onChange} label={t('coupons.pick_a_date')} />
		</HStack>
	);
}
