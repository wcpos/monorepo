import * as React from 'react';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';

import type { PrinterFormValues } from '../schema';

interface DrawerEmulationWarningProps {
	vendor: PrinterFormValues['vendor'];
	language: PrinterFormValues['language'];
}

export function DrawerEmulationWarning({ vendor, language }: DrawerEmulationWarningProps) {
	const t = useT();
	const mismatch =
		(vendor === 'star' && language === 'esc-pos') ||
		(vendor !== 'star' && (language === 'star-line' || language === 'star-prnt'));

	if (!mismatch) {
		return null;
	}

	return (
		<Text testID="add-printer-drawer-emulation-warning" className="text-warning text-xs">
			{t(
				'settings.cash_drawer_emulation_warning',
				'Cash drawer kicks depend on printer language/emulation. If the drawer does not open, match this language to the printer emulation mode.'
			)}
		</Text>
	);
}
