import * as React from 'react';

import { useT } from '../../../../contexts/translations';

/** Characters per line, not paper mm: 58 mm paper is 32; 80 mm printers run 42, 48 or 64. */
export const PRINTER_TEXT_WIDTHS = [32, 42, 48, 64] as const;

/** The printer form's lists for the wizard and Edit Printer; each key a literal `t('…')`. */
export function usePrinterOptions() {
	const t = useT();
	return React.useMemo(
		() => ({
			languages: [
				{ value: 'esc-pos', label: 'ESC/POS' },
				{ value: 'star-prnt', label: 'StarPRNT' },
				{ value: 'star-line', label: 'Star Line Mode' },
			],
			columns: [
				{ value: '32', label: t('settings.setup_width_32') },
				{ value: '42', label: t('settings.setup_width_42') },
				{ value: '48', label: t('settings.setup_width_48') },
				{ value: '64', label: t('settings.setup_width_64') },
			],
			// ESC/POS tables, named for the receipt's language, not the manual's code-page number. Each id
			// is one `@point-of-sale/receipt-printer-encoder` ships: a name it does not know falls back
			// to 'auto' at encode time, so the list must not outrun it.
			codePages: [
				{ value: 'auto', label: t('settings.codepage_auto') },
				{ value: 'cp437', label: t('settings.codepage_cp437') },
				{ value: 'windows1252', label: t('settings.codepage_windows1252') },
				{ value: 'cp852', label: t('settings.codepage_cp852') },
				{ value: 'windows1251', label: t('settings.codepage_windows1251') },
				{ value: 'windows1253', label: t('settings.codepage_windows1253') },
				{ value: 'windows1254', label: t('settings.codepage_windows1254') },
				{ value: 'windows1256', label: t('settings.codepage_windows1256') },
				{ value: 'windows1255', label: t('settings.codepage_windows1255') },
				// Thai is per-character-code on ESC/POS; 11 is the table the default Epson mapping carries
				// (cp874 is not in it, so offering cp874 would just fall back to 'auto').
				{ value: 'thai11', label: t('settings.codepage_thai11') },
				{ value: 'windows1258', label: t('settings.codepage_windows1258') },
			],
			drawerConnectors: [
				{ value: 'pin2', label: t('settings.drawer_pin2') },
				{ value: 'pin5', label: t('settings.drawer_pin5') },
			],
		}),
		[t]
	);
}
