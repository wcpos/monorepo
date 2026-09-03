import * as React from 'react';

import { useStoreSession } from '@wcpos/core/contexts/app-state';
import { useT } from '@wcpos/core/contexts/translations';
import { getDisplaySignaling } from '@wcpos/core/screens/main/display/store';
import { CustomerDisplaySettings, SettingsPage } from '@wcpos/core/screens/main/settings';

export default function CustomerDisplaySettingsPage() {
	const t = useT();
	const { store } = useStoreSession();
	if (!getDisplaySignaling(store)) return null;
	return (
		<SettingsPage title={t('settings.customer_display')} testID="screen-settings-customer-display">
			<CustomerDisplaySettings />
		</SettingsPage>
	);
}
