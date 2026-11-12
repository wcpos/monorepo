import * as React from 'react';

import { debounceTime, filter } from 'rxjs';

import { useQueryRuntime } from '@wcpos/query';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import {
	closeRegister,
	failureFacts,
	findUnwrittenCloses,
	isCloseInFlight,
	observeRegisterSessionAvailability,
	runRegisterSessionCycle,
	sessionRefreshRequests,
} from '@wcpos/query/register-session';

import { recordRegisterFact, useRegisterActor } from './audit';
import { useStoreSession } from '../../contexts/app-state';
import { useStoreDay } from '../../hooks/use-store-day';
import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import { useRegisterBinding } from '../register/use-register-binding';

/**
 * Closes whose closure write a restart interrupted (#3289), keyed by session id, per app start:
 * at most five attempts, each retry no sooner than 1, 2, 5 and 10 minutes after the failure
 * before it, taken on the bridge's next cycle (the minute tick). Then none until the next start.
 */
const RECOVERY_BACKOFF_MS = [60_000, 120_000, 300_000, 600_000];
const recovering = new Map<string, { attempt: number; dueAt: number }>();
const log = getLogger(['wcpos', 'registerSession']);

export function RegisterSessionBridge() {
	const { storeDB, userDB, site, store, wpCredentials } = useStoreSession();
	const runtime = useQueryRuntime();
	const http = useRestHttpClient();
	const { registerId, registerName } = useRegisterBinding();
	const { timezone } = useStoreDay();
	// What a manual close passes `closeRegister`; a recovered close needs no cashier input.
	const closeRef = React.useRef({ site, credentials: wpCredentials, timezone, registerName });
	React.useEffect(() => {
		closeRef.current = { site, credentials: wpCredentials, timezone, registerName };
	}, [site, wpCredentials, timezone, registerName]);
	const online = useOnlineStatus().status === 'online-website-available';
	// The cycle names the opener by the signed-in user; a cashier switch is no reason to re-run it.
	const actor = useRegisterActor();
	const actorRef = React.useRef(actor);
	React.useEffect(() => {
		actorRef.current = actor;
	}, [actor]);
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
		// The reused close (`countRecorded`): the closure from the recorded count, no second close.
		const finishCloses = async () => {
			let finished = false;
			for (const session of registerId ? await findUnwrittenCloses(storeDB, registerId) : []) {
				// A close still running here is no interrupted close; skipping it is not an attempt.
				if (isCloseInFlight(session.id)) continue;
				const { attempt = 0, dueAt = 0 } = recovering.get(session.id) ?? {};
				if (Date.now() < dueAt) continue;
				// In flight: due again only once this attempt has failed.
				recovering.set(session.id, { attempt: attempt + 1, dueAt: Infinity });
				const { registerName: name, ...close } = closeRef.current;
				try {
					await closeRegister(
						{
							...close,
							storeDB,
							userDB,
							siteUuid: site.uuid!,
							actor: actorRef.current,
							engine: runtime.engine,
							registerName: name ?? '',
						},
						session.id,
						{ counted: { ...session.counted } as { cash: string } }
					);
					finished = true;
				} catch (error) {
					const wait = RECOVERY_BACKOFF_MS[attempt] ?? Infinity;
					recovering.set(session.id, { attempt: attempt + 1, dueAt: Date.now() + wait });
					// Error level reaches the app log and Sentry; no toast, nothing shown to the cashier.
					log.error('Register close recovery failed', {
						code: ERROR_CODES.SYNC_UNEXPECTED,
						context: {
							stage: 'close-recovery',
							sessionId: session.id,
							registerId,
							attempt: attempt + 1,
							...failureFacts(error),
						},
					});
				}
			}
			return finished;
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
				actor: actorRef.current,
			})
				.then(() => {
					consecutiveFailures.current = 0;
				}, report)
				// Then the outbox sends counting, closed and the closure, in order, on the rerun.
				.then(finishCloses)
				.then(
					(finished) => {
						if (finished) rerun.current = cycle;
					},
					(error: unknown) => report(Object.assign(Object(error), { stage: 'close-recovery' }))
				)
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
