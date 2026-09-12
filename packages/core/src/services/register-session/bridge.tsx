import * as React from 'react';

import { engineCollection, useQueryRuntime } from '@wcpos/query';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';

import { useStoreSession } from '../../contexts/app-state';
import { readRegister } from '../register/register-document';
import { writeClosure } from './session-store';
import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import { useRegisterBinding } from '../register/use-register-binding';
import { failureFacts } from './failure-facts';
import { drainRegisterSessionQueue } from './queue';
import { refreshSessions } from './refresh';
import {
	useCashMovementCollection,
	useClosureCollection,
	useRegisterSessionCollection,
} from './use-register-session-collections';

const logger = getLogger(['wcpos', 'registerSession']);
export function RegisterSessionBridge() {
	const { userDB, site, store } = useStoreSession();
	const { engine } = useQueryRuntime();
	const closures = useClosureCollection();
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
		if (!sessions || !movements || !closures) return;
		// Which half of the cycle broke is the first thing a diagnosis needs, and the rejection
		// never carries it — so each stage tags its own failures on the way out.
		const staged = <T,>(stage: string, work: () => Promise<T>) =>
			work().catch((error: unknown) => {
				throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage });
			});
		const sync = async () => {
			const reservation = await staged(
				'reservation',
				async () =>
					(await readRegister(userDB))?.sites[site.uuid!]?.registers?.[registerId ?? '']
						?.closure_reservation
			);
			if (reservation && !reservation.applied && reservation.row.store_id === (store.id ?? null)) {
				const session = await sessions.findOne(reservation.row.session_id).exec();
				if (session)
					await staged('closure', () =>
						writeClosure({
							closures,
							userDB,
							siteUuid: site.uuid!,
							session,
							counted: reservation.row.counted.cash,
							otherTenders: reservation.row.counted,
							movements: [],
							orders: [],
						})
					);
			}
			if (!online) return;
			await staged('drain', () =>
				drainRegisterSessionQueue({
					sessions,
					movements,
					closures,
					userDB,
					siteUuid: site.uuid!,
					orders: engineCollection(engine.active()?.database, 'orders'),
					http,
					logger,
				})
			);
			if (registerId)
				await staged('refresh', () =>
					refreshSessions({ registerId, sessions, movements, closures, http })
				);
		};
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
	}, [
		sessions,
		movements,
		closures,
		userDB,
		site.uuid,
		store.id,
		engine,
		http,
		registerId,
		online,
	]);
	return null;
}
