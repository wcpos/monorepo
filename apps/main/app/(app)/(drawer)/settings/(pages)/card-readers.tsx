import * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';
import { CardReadersSettings, SettingsPage } from '@wcpos/core/screens/main/settings';

export default function CardReadersSettingsPage() {
	const t = useT();

	return (
		<SettingsPage
			title={t('settings.card_readers')}
			description={t('settings.card_readers_description')}
			testID="screen-settings-card-readers"
		>
			<CardReadersSettings />
		</SettingsPage>
	);
}
