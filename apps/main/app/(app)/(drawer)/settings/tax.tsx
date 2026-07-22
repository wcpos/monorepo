import * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';
import { SettingsPage, TaxSettings } from '@wcpos/core/screens/main/settings';

export default function TaxSettingsPage() {
	const t = useT();

	return (
		<SettingsPage title={t('settings.tax', 'Tax')} testID="screen-settings-tax">
			<TaxSettings />
		</SettingsPage>
	);
}
