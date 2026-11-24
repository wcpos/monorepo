import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Section } from '@wcpos/components/section';
import { Text } from '@wcpos/components/text';
import { useHttpClient } from '@wcpos/hooks/use-http-client';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { useAppState, useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { permissionsRefreshGateFor } from '../../../services/permissions-refresh/gate';
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
	// The sync bridge reads through the same gate, so the two never read at once (no uuid: no bridge).
	const gate = permissionsRefreshGateFor(wpCredentials.uuid ?? '');
	// eslint-disable-next-line wcpos/no-dollar-getter-into-observable-hooks -- the gate exposes a stable BehaviorSubject property, not an RxDB $-getter; same exception as use-first-answer.ts (2026-11-24).
	const reading = useObservableEagerState(gate.reading$);
	const [result, setResult] = React.useState<PermissionsReadResult | null>(null);
	const refresh = async () => {
		if (!gate.shouldRead({ kind: 'manual' })) return;
		let next: PermissionsReadResult | undefined;
		try {
			next = await readCashierPermissions({ http, site, wpCredentials, userDB, user });
		} finally {
			gate.settled({ ok: next?.kind === 'updated' || next?.kind === 'unchanged' });
		}
		setResult(next);
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
