import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import { Section } from '@wcpos/components/section';
import { Text } from '@wcpos/components/text';
import { useHttpClient } from '@wcpos/hooks/use-http-client';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { useAppState, useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import {
	type PermissionsReadResult,
	readCashierPermissions,
} from '../../../services/permissions-refresh/read-cashier-permissions';

export function PermissionsPanel() {
	const t = useT();
	const { site, wpCredentials } = useStoreSession();
	const { userDB, user } = useAppState();
	const http = useHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const [reading, setReading] = React.useState(false);
	const [result, setResult] = React.useState<PermissionsReadResult | null>(null);
	const refresh = async () => {
		setReading(true);
		setResult(await readCashierPermissions({ http, site, wpCredentials, userDB, user }));
		setReading(false);
	};
	let message = '';
	switch (result?.kind) {
		case 'updated':
			message = t('health.permissions.updated', {
				granted: result.granted,
				removed: result.removed,
			});
			break;
		case 'unchanged':
			message = t('health.permissions.unchanged');
			break;
		case 'refused':
			message = t('health.permissions.refused');
			break;
		case 'expired':
			message = t('health.permissions.expired');
			break;
		case 'offline':
			message = t('health.permissions.offline');
			break;
		case 'failed':
			message = t('health.permissions.failed');
			break;
	}
	return (
		<Section
			title={t('health.permissions.title')}
			sub={t('health.permissions.sub')}
			action={
				<Button
					variant="outline"
					size="sm"
					testID="health-permissions-refresh"
					disabled={reading || !online}
					onPress={() => void refresh()}
				>
					<ButtonText>{t('health.permissions.refresh')}</ButtonText>
				</Button>
			}
		>
			<Text testID="health-permissions-result">{message}</Text>
		</Section>
	);
}
