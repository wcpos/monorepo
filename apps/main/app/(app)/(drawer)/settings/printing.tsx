import * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';
import { PrintingSettings, SettingsPage } from '@wcpos/core/screens/main/settings';

export default function PrintingSettingsPage() {
	const t = useT();

	return (
		<SettingsPage title={t('settings.printing', 'Printing')} testID="screen-settings-printing">
			<PrintingSettings />
		</SettingsPage>
	);
}
