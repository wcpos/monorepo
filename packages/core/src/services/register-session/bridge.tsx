import * as React from 'react';

import { engineCollection, useQueryRuntime } from '@wcpos/query';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';

import { useStoreSession } from '../../contexts/app-state';
import { readRegister } from '../register/register-document';
import { writeClosure } from './session-store';
import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import { useRegisterBinding } from '../register/use-register-binding';
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
	// Imperative outbox delivery has mount/connectivity and timer triggers, not render state.
	React.useEffect(() => {
		if (!sessions || !movements || !closures) return;
		const sync = async () => {
			const reservation = (await readRegister(userDB))?.sites[site.uuid!]?.registers?.[
				registerId ?? ''
			]?.closure_reservation;
			if (reservation && !reservation.applied && reservation.row.store_id === (store.id ?? null)) {
				const session = await sessions.findOne(reservation.row.session_id).exec();
				if (session)
					await writeClosure({
						closures,
						userDB,
						siteUuid: site.uuid!,
						session,
						counted: reservation.row.counted.cash,
						otherTenders: reservation.row.counted,
						movements: [],
						orders: [],
					});
			}
			if (!online) return;
			await drainRegisterSessionQueue({
				sessions,
				movements,
				closures,
				userDB,
				siteUuid: site.uuid!,
				orders: engineCollection(engine.active()?.database, 'orders'),
				http,
				logger,
			});
			if (registerId) await refreshSessions({ registerId, sessions, movements, closures, http });
		};
		const report = () => logger.warn('Register session refresh/drain failed');
		void sync().catch(report);
		const tick = setInterval(() => {
			void sync().catch(report);
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
