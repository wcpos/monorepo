import * as React from 'react';

import { useHttpClient } from '@wcpos/hooks/use-http-client';

import { useAppState, useStoreSession } from '../../contexts/app-state';
import { createPermissionsRefreshGate } from './gate';
import { readCashierPermissions } from './read-cashier-permissions';
import { permissionsSignal$ } from './signal';

export function PermissionsRefreshBridge(): null {
	const { site, wpCredentials } = useStoreSession();
	const { userDB, user } = useAppState();
	const http = useHttpClient();
	const uuid = wpCredentials.uuid;
	const gate = React.useMemo(() => createPermissionsRefreshGate(), [uuid]);
	// Sync signals are external events; the subscription belongs to the active cashier.
	React.useEffect(() => {
		if (!uuid) return;
		const subscription = permissionsSignal$.subscribe((signal) => {
			if (!gate.shouldRead(signal)) return;
			const stamp = signal.kind === 'stamp' ? signal.stamp : undefined;
			void readCashierPermissions({ http, site, wpCredentials, userDB, user }).then((result) => {
				gate.settled({ ok: result.kind === 'updated' || result.kind === 'unchanged', stamp });
			});
		});
		return () => {
			subscription.unsubscribe();
		};
	}, [gate, uuid, http, site, wpCredentials, userDB, user]);
	return null;
}
