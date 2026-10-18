import * as React from 'react';

import { debounceTime, filter } from 'rxjs';

import { useQueryRuntime } from '@wcpos/query';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	failureFacts,
	observeRegisterSessionAvailability,
	runRegisterSessionCycle,
	sessionRefreshRequests,
} from '@wcpos/query/register-session';

import { recordRegisterFact } from './audit';
import { useStoreSession } from '../../contexts/app-state';
import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import { useRegisterBinding } from '../register/use-register-binding';

export function RegisterSessionBridge() {
	const { storeDB, userDB, site, store } = useStoreSession();
	const runtime = useQueryRuntime();
	const http = useRestHttpClient();
	const { registerId } = useRegisterBinding();
	const online = useOnlineStatus().status === 'online-website-available';
	// One cycle failing is a blip; the same cycle still failing a minute later is the merchant's
	// problem. The rubric's terminal-outcome rule puts the verdict here, where the arc is visible.
	const consecutiveFailures = React.useRef(0);
	const inFlight = React.useRef(false);
	const rerun = React.useRef<(() => void) | null>(null);
	// Imperative outbox delivery has mount/connectivity and timer triggers, not render state.
	React.useEffect(() => {
		if (!storeDB) return;
		let ready = false;
		// A streak belongs to one register on one store. AppStack stays mounted across a store
		// switch, so without this the new scope inherits the old one's count and escalates to
		// warn on its very first hiccup.
		consecutiveFailures.current = 0;

		const report = (error: unknown) => {
			const { status, errorCode, message } = failureFacts(error);
			const stage = (error as { stage?: string })?.stage ?? 'refresh';
			const failures = (consecutiveFailures.current += 1);
			recordRegisterFact({
				kind: 'bridge-cycle-failed',
				registerId,
				stage,
				status,
				errorCode,
				message: message ?? String(error),
				consecutiveFailures: failures,
			});
		};
		const cycle = () => {
			if (!ready) return;
			// Coalesce triggers so an older response cannot overwrite a newer snapshot.
			if (inFlight.current) {
				rerun.current = cycle;
				return;
			}
			inFlight.current = true;
			void runRegisterSessionCycle({
				storeDB,
				userDB,
				siteUuid: site.uuid!,
				storeId: store.id,
				registerId,
				online,
				engine: runtime.engine,
				http,
			})
				.then(() => {
					consecutiveFailures.current = 0;
				}, report)
				.finally(() => {
					inFlight.current = false;
					const next = rerun.current;
					rerun.current = null;
					next?.();
				});
		};
		const refreshRequests = sessionRefreshRequests
			.pipe(
				filter((request) => request.storeDB === storeDB && request.registerId === registerId),
				debounceTime(250)
			)
			.subscribe(() => void cycle());
		const availability = observeRegisterSessionAvailability(storeDB).subscribe((available) => {
			ready = available;
			if (ready) {
				consecutiveFailures.current = 0;
				void cycle();
			}
		});
		const tick = setInterval(() => {
			void cycle();
		}, 60_000);
		return () => {
			if (rerun.current === cycle) rerun.current = null;
			clearInterval(tick);
			refreshRequests.unsubscribe();
			availability.unsubscribe();
		};
	}, [userDB, storeDB, site.uuid, store.id, runtime.engine, http, registerId, online]);
	return null;
}
