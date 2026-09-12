import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';

import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import { useRegisterBinding } from '../register/use-register-binding';
import { failureFacts } from './failure-facts';
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
	// One cycle failing is a blip; the same cycle still failing a minute later is the merchant's
	// problem. The rubric's terminal-outcome rule puts the verdict here, where the arc is visible.
	const consecutiveFailures = React.useRef(0);
	// Imperative outbox delivery has mount/connectivity and timer triggers, not render state.
	React.useEffect(() => {
		if (!sessions || !movements || !online) return;
		const drain = () =>
			drainRegisterSessionQueue({ sessions, movements, http, logger }).catch((error) => {
				throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
					stage: 'drain',
				});
			});
		const sync = () =>
			drain().then(() =>
				registerId ? refreshSessions({ registerId, sessions, movements, http }) : undefined
			);
		const report = (error: unknown) => {
			const { status, errorCode, message } = failureFacts(error);
			const failures = (consecutiveFailures.current += 1);
			const options = {
				context: {
					stage: (error as { stage?: string })?.stage ?? 'refresh',
					endpoint: 'sessions',
					status,
					errorCode,
					message: message ?? String(error),
					consecutiveFailures: failures,
				},
			};
			if (failures > 1) logger.warn('Register session refresh/drain still failing', options);
			else logger.debug('Register session refresh/drain failed', options);
		};
		const cycle = () =>
			sync().then(() => {
				consecutiveFailures.current = 0;
			}, report);
		void cycle();
		const tick = setInterval(() => {
			void cycle();
		}, 60_000);
		return () => clearInterval(tick);
	}, [sessions, movements, http, registerId, online]);
	return null;
}
