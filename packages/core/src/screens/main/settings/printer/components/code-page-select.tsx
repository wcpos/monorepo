import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { useT } from '../../../../../contexts/translations';

/**
 * ESC/POS character tables, named for the language on the receipt rather than the code-page number
 * in the printer manual. Every id here is one `@point-of-sale/receipt-printer-encoder` ships — a
 * name it does not know falls back to 'auto' at encode time, so the list must not outrun it.
 */
const CODE_PAGES = [
	'auto',
	'cp437',
	'windows1252',
	'cp852',
	'windows1251',
	'windows1253',
	'windows1254',
	'windows1256',
	'windows1255',
	// Thai is per-character-code on ESC/POS; 11 is the table the default Epson mapping carries
	// (cp874 is not in it, so offering cp874 would just fall back to 'auto').
	'thai11',
	'windows1258',
] as const;

export function CodePageSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();

	const options = React.useMemo(
		() => CODE_PAGES.map((id) => ({ value: id, label: t(`settings.codepage_${id}`) })),
		[t]
	);

	return (
		<OptionSelect
			options={options}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('settings.printer_code_page')}
			fallbackLabel=""
			matchWidth
			{...props}
		/>
	);
}
