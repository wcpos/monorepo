import * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';
import { KeyboardShortcuts, SettingsPage } from '@wcpos/core/screens/main/settings';

export default function ShortcutsSettingsPage() {
	const t = useT();

	return (
		<SettingsPage title={t('settings.keyboard_shortcuts')} testID="screen-settings-shortcuts">
			<KeyboardShortcuts />
		</SettingsPage>
	);
}
