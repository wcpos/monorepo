import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { useT } from '../../../../../contexts/translations';

export function PaperWidthSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();

	const options = React.useMemo(
		() => [
			// This field stores printer character capacity (CPL), not physical paper width.
			// 80mm printers are commonly configured as either 42 or 48 columns, so expose both.
			{
				value: '42',
				label: t('settings.printer_width_80mm_standard'),
			},
			{
				value: '48',
				label: t('settings.printer_width_80mm_wide'),
			},
			{
				value: '32',
				label: t('settings.printer_width_58mm'),
			},
		],
		[t]
	);

	return (
		<OptionSelect
			options={options}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('settings.select_printer_text_width')}
			fallbackLabel=""
			matchWidth
			{...props}
		/>
	);
}
