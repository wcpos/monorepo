import * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';
import { GeneralSettings, SettingsPage } from '@wcpos/core/screens/main/settings';

export default function GeneralSettingsPage() {
	const t = useT();

	return (
		<SettingsPage title={t('settings.general_settings')} testID="screen-settings-general">
			<GeneralSettings />
		</SettingsPage>
	);
}
