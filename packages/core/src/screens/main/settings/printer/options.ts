import * as React from 'react';

import { useT } from '../../../../contexts/translations';

/** Characters per line, not paper mm: 58 mm paper is 32; 80 mm printers run 42, 48 or 64. */
export const PRINTER_TEXT_WIDTHS = [32, 42, 48, 64] as const;

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

/** The printer form's fixed lists for `FormSelect`; the setup wizard and Edit Printer share them. */
export function usePrinterOptions() {
	const t = useT();
	return React.useMemo(
		() => ({
			languages: [
				{ value: 'esc-pos', label: 'ESC/POS' },
				{ value: 'star-prnt', label: 'StarPRNT' },
				{ value: 'star-line', label: 'Star Line Mode' },
			],
			columns: PRINTER_TEXT_WIDTHS.map((width) => ({
				value: String(width),
				label: t(`settings.setup_width_${width}`),
			})),
			codePages: CODE_PAGES.map((id) => ({ value: id, label: t(`settings.codepage_${id}`) })),
			drawerConnectors: [
				{ value: 'pin2', label: t('settings.drawer_pin2') },
				{ value: 'pin5', label: t('settings.drawer_pin5') },
			],
		}),
		[t]
	);
}
