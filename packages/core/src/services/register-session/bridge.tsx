import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';

import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import { useRegisterBinding } from '../register/use-register-binding';
import { drainRegisterSessionQueue } from './queue';
import { refreshSessions } from './refresh';
import {
	useCashMovementCollection,
	useRegisterSessionCollection,
} from './use-register-session-collections';

const logger = getLogger(['wcpos', 'registerSession']);
export function RegisterSessionBridge() {
	const sessions = useRegisterSessionCollection();
	const movements = useCashMovementCollection();
	const http = useRestHttpClient();
	const { registerId } = useRegisterBinding();
	const online = useOnlineStatus().status === 'online-website-available';
	// Imperative outbox delivery has mount/connectivity and timer triggers, not render state.
	React.useEffect(() => {
		if (!sessions || !movements || !online) return;
		const drain = () => drainRegisterSessionQueue({ sessions, movements, http, logger });
		const report = () => logger.warn('Register session refresh/drain failed');
		void drain()
			.then(() =>
				registerId ? refreshSessions({ registerId, sessions, movements, http }) : undefined
			)
			.catch(report);
		const tick = setInterval(() => {
			void drain().catch(report);
		}, 60_000);
		return () => clearInterval(tick);
	}, [sessions, movements, http, registerId, online]);
	return null;
}
