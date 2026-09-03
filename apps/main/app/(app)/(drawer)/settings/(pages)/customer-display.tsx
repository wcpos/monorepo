import * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';
import { CustomerDisplaySettings, SettingsPage } from '@wcpos/core/screens/main/settings';

export default function CustomerDisplaySettingsPage() {
	const t = useT();

	return (
		<SettingsPage
			title={t('settings.customer_display.title')}
			testID="screen-settings-customer-display"
		>
			<CustomerDisplaySettings />
		</SettingsPage>
	);
}
