import * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';
import { SettingsPage, ThemeSettings } from '@wcpos/core/screens/main/settings';

export default function ThemeSettingsPage() {
	const t = useT();

	return (
		<SettingsPage title={t('settings.theme')} testID="screen-settings-theme">
			<ThemeSettings />
		</SettingsPage>
	);
}
