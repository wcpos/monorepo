import * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';
import { BarcodeScanning, SettingsPage } from '@wcpos/core/screens/main/settings';

export default function BarcodeScanningSettingsPage() {
	const t = useT();

	return (
		<SettingsPage title={t('settings.barcode_scanning')} testID="screen-settings-barcode-scanning">
			<BarcodeScanning />
		</SettingsPage>
	);
}
