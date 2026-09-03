import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import type { TypedIpcRenderer } from '@wcpos/printer/ipc-channels';

import { SettingsSection } from '../components/settings-section';
import { useT } from '../../../../contexts/translations';

export function OpenSecondScreen({ url }: { url: string }) {
	const t = useT();
	const open = React.useCallback(() => {
		const ipcRenderer = (window as unknown as { ipcRenderer?: Pick<TypedIpcRenderer, 'send'> })
			.ipcRenderer;
		ipcRenderer?.send('open-customer-display', { url });
	}, [url]);

	return (
		<SettingsSection
			title={t('settings.customer_display.second_screen')}
			description={t('settings.customer_display.second_screen_description')}
		>
			<Button onPress={open}>
				<ButtonText>{t('settings.customer_display.open_second_screen')}</ButtonText>
			</Button>
		</SettingsSection>
	);
}
