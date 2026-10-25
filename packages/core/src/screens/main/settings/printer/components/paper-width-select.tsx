import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { useT } from '../../../../../contexts/translations';

/**
 * The printer text widths (characters per line, not paper millimetres) the app offers:
 * 58 mm paper is 32; 80 mm printers run 42, 48 or 64 depending on model and font. The
 * setup wizard and the Edit Printer dialog both offer exactly these.
 */
export const PRINTER_TEXT_WIDTHS = [32, 42, 48, 64] as const;

export function PaperWidthSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();

	const options = React.useMemo(
		() =>
			PRINTER_TEXT_WIDTHS.map((width) => ({
				value: String(width),
				label: t(`settings.setup_width_${width}`),
			})),
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
