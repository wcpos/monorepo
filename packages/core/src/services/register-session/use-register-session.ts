import * as React from 'react';

import { TZDate } from '@date-fns/tz';
import { useObservableState } from 'observable-hooks';
import { distinctUntilChanged, map, of, timer } from 'rxjs';

import { observeSiteCredentials, PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { useDocField, useQueryRuntime } from '@wcpos/query';
import {
	abandonCount,
	beginCount,
	closeRegister,
	observeRegisterDrawer,
	openSession,
	readMovement,
	recordLiveSession,
	recordMovement,
	type RegisterCount,
	RegisterSessionRequiredError,
	requireOpenSession,
	retryMovement,
	sessionRefreshRequests,
	voidMovement,
} from '@wcpos/query/register-session';

import { DEVICE_ZONE, inZone } from '../../hooks/store-zone';
import { useStoreDay } from '../../hooks/use-store-day';
import { convertUTCStringToLocalDate } from '../../hooks/use-local-date';
import { recordRegisterFact, useRegisterActor } from './audit';
import { useStoreSession } from '../../contexts/app-state';
import { useRegisterBinding } from '../register/use-register-binding';

/**
 * Whether now is past the first `HH:MM` close, on the store's clock, after the session opened:
 * a session opened after tonight's close is due at tomorrow's, and one left open overnight
 * stays overdue past midnight. No or unreadable close time, or no open time, is never past.
 */
export function isPastClose(
	closeTime: string | null | undefined,
	openedAtGmt: string | null | undefined,
	zone: string
) {
	const [hour, minute] = String(closeTime ?? '')
		.split(':')
		.map(Number);
	if (!closeTime || !openedAtGmt || !Number.isFinite(hour) || !Number.isFinite(minute)) {
		return false;
	}
	const opened = convertUTCStringToLocalDate(openedAtGmt).getTime();
	if (Number.isNaN(opened)) return false;
	const day = inZone(zone, new Date(opened));
	const closeOn = (offset: number) =>
		(zone === DEVICE_ZONE
			? new Date(day.getFullYear(), day.getMonth(), day.getDate() + offset, hour, minute)
			: new TZDate(day.getFullYear(), day.getMonth(), day.getDate() + offset, hour, minute, zone)
		).getTime();
	const close = closeOn(0) > opened ? closeOn(0) : closeOn(1);
	return Date.now() > close;
}

function usePastCloseClock(...args: Parameters<typeof isPastClose>) {
	const [closeTime, openedAt, zone] = args;
	// The clock is not in the data stream: there it re-rendered every consumer once a minute
	// with nothing changed (roadmap#423). This stream emits only when the verdict flips.
	const pastClose$ = React.useMemo(
		() =>
			timer(0, 60_000).pipe(
				map(() => isPastClose(closeTime, openedAt, zone)),
				distinctUntilChanged()
			),
		[closeTime, openedAt, zone]
	);
	// The subscription only schedules the render at the flip; the verdict is read fresh below,
	// so a close time changed mid-session never renders the previous close time's verdict for
	// the tick before the new stream emits.
	useObservableState(pastClose$, () => isPastClose(closeTime, openedAt, zone));
}

/** Overdue, at the leaf: only an open session can be; its opening fixes which close it is due at. */
export function useOverdue(session: { status: string; opened_at_gmt: string } | null) {
	const { store } = useStoreSession();
	const { timezone } = useStoreDay();
	const closeTime = useDocField(store, (value) => value.expected_close_time);
	const openedAt = session?.status === 'open' ? session.opened_at_gmt : null;
	usePastCloseClock(closeTime, openedAt, timezone);
	return { overdue: !!openedAt && isPastClose(closeTime, openedAt, timezone), closeTime };
}

export function useRegisterSession() {
	const { store, wpCredentials, userDB, storeDB, site } = useStoreSession();
	const actor = useRegisterActor();
	const cashiers$ = React.useMemo(() => observeSiteCredentials(site), [site]);
	const cashiers = useObservableState(cashiers$, PENDING_USER_DB_READ);
	const { today, timezone } = useStoreDay();
	const runtime = useQueryRuntime();
	const binding = useRegisterBinding();
	const sessionsOn = !!useDocField(store, (value) => value.register_sessions);
	const varianceThreshold = useDocField(store, (value) => value.variance_threshold);
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities);
	const source = React.useMemo(
		() =>
			!binding.registerId || !sessionsOn
				? of(null)
				: observeRegisterDrawer(
						{ storeDB, userDB, siteUuid: site.uuid!, engine: runtime.engine },
						binding.registerId
					).pipe(map((drawer) => drawer && { ...drawer, storeDB, registerId: binding.registerId })),
		// Locale historically rebinds the reads.
		[storeDB, userDB, site.uuid, binding.registerId, sessionsOn, runtime.engine, runtime.locale]
	);
	const observed = useObservableState(source, null);
	// An answer for another store, register or collection generation is not this register's.
	const data =
		observed?.storeDB === storeDB &&
		observed?.registerId === binding.registerId &&
		observed?.isCurrent() &&
		sessionsOn
			? observed
			: null;
	const session = data?.session ?? null;
	const { overdue, closeTime } = useOverdue(session);
	const refusedClose = !!data?.refusedClose;
	const figuresPending = !!data?.figuresPending;
	// Ask the existing bridge to refresh external state; it debounces requests across consumers.
	const baselineStale = !!data?.baselineStale;
	React.useEffect(() => {
		if (baselineStale && storeDB && binding.registerId)
			sessionRefreshRequests.next({ storeDB, registerId: binding.registerId });
	}, [baselineStale, storeDB, binding.registerId]);
	const countingBy =
		session?.status === 'counting' && session.counting_by != null
			? {
					id: session.counting_by,
					name:
						(cashiers === PENDING_USER_DB_READ ? [] : cashiers).find(
							(row) => row.id === session.counting_by
						)?.display_name ?? null,
					at: session.counting_started_at_gmt ?? null,
				}
			: null;
	return {
		session,
		/**
		 * `session` is null both for a closed register and before the combined query first
		 * emits; only this tells them apart, so an open register never flashes as closed.
		 */
		loaded: !sessionsOn || data !== null,
		movements: data?.movements ?? [],
		refusedMovements: data?.refusedMovements ?? [],
		refusedCash: data?.refusedCash ?? [],
		expected: data?.expected ?? {},
		terms: data?.terms,
		varianceThreshold,
		unsyncedCount: data?.unsyncedCount ?? 0,
		sessionsOn,
		overdue,
		/** The store's HH:MM close time; what `overdue` is measured against. */
		closeTime,
		binding,
		blind: !capabilities?.includes('view_woocommerce_pos_reports'),
		figuresPending,
		/** This device owns the cached count mark, not another till. */
		countingHere: !!data?.countingHere,
		// The close cleared the count mark; a close the store refused is still this till's count.
		countingElsewhere:
			!!session && session.status === 'counting' && !data?.countingHere && !refusedClose,
		refusedClose,
		countingBy,
		closedElsewhere: data?.closedElsewhere ?? null,
		salesCount: data?.salesCount ?? 0,
		lastClosure: data?.lastClosure ?? null,
		lastClosed: data?.lastClosed ?? null,
		actions: {
			openSession: async (input: { expectedFloat: string | null; countedFloat: string }) => {
				const row = await openSession(storeDB, {
					...input,
					registerId: binding.registerId!,
					openedBy: wpCredentials.id ?? 0,
					businessDay: today(),
					storeId: store.id,
				});
				await recordLiveSession(userDB, site.uuid!, row.register_id, {
					session_id: row.id,
					status: 'open',
					opened_at_gmt: row.opened_at_gmt,
					opened_by: { id: wpCredentials.id ?? 0, name: wpCredentials.display_name ?? '' },
					acknowledged: false,
					expected_float: row.expected_float ?? null,
					counted_float: row.counted_float ?? null,
					business_day: row.business_day ?? null,
				});
				recordRegisterFact({
					kind: 'session-opened',
					actor,
					sessionId: row.id,
					registerId: row.register_id,
					amount: row.counted_float,
					variance: row.opening_variance,
				});
				return row;
			},
			startCounting: async () => {
				if (figuresPending) throw new Error('register_figures_pending');
				if (!session) throw new RegisterSessionRequiredError();
				return beginCount({ storeDB, userDB, siteUuid: site.uuid!, actor }, session.id);
			},
			backToSelling: async () => {
				if (!session) throw new RegisterSessionRequiredError();
				return abandonCount({ storeDB, userDB, siteUuid: site.uuid!, actor }, session.id);
			},
			closeSession: async (input: RegisterCount) => {
				if (!session) throw new RegisterSessionRequiredError();
				// A seeded `counting` row skips `startCounting`; the close is the second door (§ 4.9).
				if (figuresPending) throw new Error('register_figures_pending');
				return closeRegister(
					{
						storeDB,
						userDB,
						siteUuid: site.uuid!,
						actor,
						engine: runtime.engine,
						site,
						credentials: wpCredentials,
						timezone,
						registerName: binding.registerName ?? '',
					},
					session.id,
					input
				);
			},
			recordMovement: async (input: {
				type: 'paid_in' | 'paid_out' | 'no_sale';
				amount: string;
				reason: string;
			}) => {
				const id = await requireOpenSession(storeDB, binding.registerId, true);
				const row = await recordMovement(storeDB, {
					...input,
					sessionId: id!,
					actor: wpCredentials.id ?? 0,
				});
				recordRegisterFact({
					kind: 'movement-recorded',
					actor,
					sessionId: row.session_id,
					registerId: binding.registerId,
					movementId: row.id,
					movementType: row.type,
					amount: row.amount,
				});
				return row;
			},
			voidMovement: async (id: string) => {
				await requireOpenSession(storeDB, binding.registerId, true);
				// The reversal row carries amount 0 for the server; the audit event records the
				// amount actually reversed, which is the target's.
				const target = await readMovement(storeDB, id);
				const row = await voidMovement(storeDB, id, wpCredentials.id ?? 0);
				recordRegisterFact({
					kind: 'movement-voided',
					actor,
					sessionId: row.session_id,
					registerId: binding.registerId,
					movementId: row.id,
					movementType: row.type,
					voidedType: target?.type,
					amount: target?.amount ?? row.amount,
					voids: id,
				});
				return row;
			},
			retryMovement: async (id: string) => {
				const row = await retryMovement(storeDB, id);
				recordRegisterFact({
					kind: 'movement-retry-requested',
					actor,
					sessionId: row.session_id,
					registerId: binding.registerId,
					movementId: row.id,
				});
				return row;
			},
		},
	};
}
