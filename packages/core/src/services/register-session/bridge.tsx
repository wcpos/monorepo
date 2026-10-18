import * as React from 'react';

import { debounceTime, filter } from 'rxjs';

import { useQueryRuntime } from '@wcpos/query';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	drainRegisterSessionQueue,
	failureFacts,
	readRegister,
	refreshSessions,
	sessionRefreshRequests,
	writeClosure,
} from '@wcpos/query/register-session';

import { recordRegisterFact } from './audit';
import { useStoreSession } from '../../contexts/app-state';
import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import { useRegisterBinding } from '../register/use-register-binding';
import {
	useCashMovementCollection,
	useClosureCollection,
	useRegisterSessionCollection,
} from './use-register-session-collections';

/**
 * Free's single store is id 0 on the client, while the server keeps NULL for a session on an
 * unassigned register (`store_id` is BIGINT NULL, and Store Reach reads 0 and NULL as the same
 * "no store"). A reservation acknowledged by the server therefore carries NULL where the local
 * draft carried 0; both name this store, so recovery must not stall on the spelling.
 */
export function sameStore(a: number | null | undefined, b: number | null | undefined): boolean {
	const unassigned = (id: number | null | undefined) => id == null || id === 0;
	return unassigned(a) ? unassigned(b) : a === b;
}

export function RegisterSessionBridge() {
	const { storeDB, userDB, site, store } = useStoreSession();
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
	const inFlight = React.useRef(false);
	const rerun = React.useRef<(() => void) | null>(null);
	// Imperative outbox delivery has mount/connectivity and timer triggers, not render state.
	React.useEffect(() => {
		if (!sessions || !movements || !closures) return;
		// A streak belongs to one register on one store. AppStack stays mounted across a store
		// switch, so without this the new scope inherits the old one's count and escalates to
		// warn on its very first hiccup.
		consecutiveFailures.current = 0;
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
			if (reservation && !reservation.applied && sameStore(reservation.row.store_id, store.id)) {
				const session = await sessions.findOne(reservation.row.session_id).exec();
				if (session)
					await staged('closure', () =>
						writeClosure({
							storeDB,
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
					storeDB,
					userDB,
					siteUuid: site.uuid!,
					engine,
					http,
				})
			);
			if (registerId) await staged('refresh', () => refreshSessions({ registerId, storeDB, http }));
		};
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
			// Coalesce triggers so an older response cannot overwrite a newer snapshot.
			if (inFlight.current) {
				rerun.current = cycle;
				return;
			}
			inFlight.current = true;
			void sync()
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
				filter((request) => request.sessions === sessions && request.registerId === registerId),
				debounceTime(250)
			)
			.subscribe(() => void cycle());
		void cycle();
		const tick = setInterval(() => {
			void cycle();
		}, 60_000);
		return () => {
			if (rerun.current === cycle) rerun.current = null;
			clearInterval(tick);
			refreshRequests.unsubscribe();
		};
	}, [
		sessions,
		movements,
		closures,
		userDB,
		storeDB,
		site.uuid,
		store.id,
		engine,
		http,
		registerId,
		online,
	]);
	return null;
}
