import * as React from 'react';

import { TZDate } from '@date-fns/tz';
import { useObservableState } from 'observable-hooks';
import { combineLatest, distinctUntilChanged, map, of, timer } from 'rxjs';

import { observeSiteCredentials, PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { useDocField, useQueryRuntime } from '@wcpos/query';
import { readLedger } from '@wcpos/order-math';
import { POS_META_KEYS } from '@wcpos/sync-core';
import { hasPendingLocalWork } from '@wcpos/sync-engine';
import {
	abandonCount,
	afterBaseline,
	baselineContains,
	beginCount,
	closeRegister,
	deriveDrawerTerms,
	deriveExpected,
	observeCashMovements,
	observeRegister$,
	observeRegisterClosures,
	observeRegisterSessions,
	observeSessionAccounting,
	openSession,
	outsideBaseline,
	readClosedElsewhere,
	readLiveSession,
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

/** A closure the store has not taken: neither accepted (`synced`) nor already on file there. */
const unacceptedIn = (id: string, closures?: { id: string; sync_status: string }[] | null) =>
	!!closures?.some((row) => row.id === id && !['synced', 'superseded'].includes(row.sync_status));
function pendingMoney(record: { local?: unknown; remoteId?: unknown }) {
	return hasPendingLocalWork(record) || record.remoteId === null;
}

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

export function useRegisterSession() {
	const { store, wpCredentials, userDB, storeDB, site } = useStoreSession();
	const actor = useRegisterActor();
	const cashiers$ = React.useMemo(() => observeSiteCredentials(site), [site]);
	const cashiers = useObservableState(cashiers$, PENDING_USER_DB_READ);
	const { today, timezone } = useStoreDay();
	const runtime = useQueryRuntime();
	const binding = useRegisterBinding();
	const register$ = React.useMemo(() => observeRegister$(userDB), [userDB]);
	const registerDoc = useObservableState(register$, null);
	const sessionsOn = !!useDocField(store, (value) => value.register_sessions);
	const varianceThreshold = useDocField(store, (value) => value.variance_threshold);
	const closeTime = useDocField(store, (value) => value.expected_close_time);
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities);
	const source = React.useMemo(() => {
		const sessions$ = observeRegisterSessions(storeDB, binding.registerId);
		const closures$ = observeRegisterClosures(storeDB, binding.registerId);
		// `session`'s order, so a refused abandon's retry has its sales; unread closures count as none.
		const accounting = observeSessionAccounting(
			runtime.engine,
			combineLatest([sessions$, closures$]).pipe(
				map(([rows, closureRows]) =>
					rows === null
						? null
						: (rows.active.find((row) => row.sync_status !== 'failed') ??
							rows.active.find(
								(row) => row.sync_status === 'failed' && unacceptedIn(row.id, closureRows)
							) ??
							rows.closed.find((row) => row.closure_id === row.id && row.sync_status !== 'synced'))
				)
			)
		);
		const stream =
			!binding.registerId || !sessionsOn
				? of(null)
				: combineLatest([sessions$, observeCashMovements(storeDB), accounting, closures$]).pipe(
						map(([rows, entries, accounting, closureRows]) =>
							rows && entries && accounting && closureRows
								? {
										storeDB,
										registerId: binding.registerId,
										...rows,
										entries,
										...accounting,
										closureRows,
									}
								: null
						)
					);
		return stream;
		// Locale historically rebinds the reads.
	}, [storeDB, binding.registerId, sessionsOn, runtime.engine, runtime.locale]);
	const observed = useObservableState(source, null);
	const data =
		observed?.storeDB === storeDB &&
		observed?.registerId === binding.registerId &&
		observed?.isCurrent() &&
		sessionsOn
			? observed
			: null;
	const unacceptedClosure = (id: string) => unacceptedIn(id, data?.closureRows);
	const session =
		data?.active.find((row) => row.sync_status !== 'failed') ??
		// Recover only a close this till made and never got acknowledged whose closure write
		// was interrupted (closure_id stamped, no local closure row); imported closed history
		// is synced and is never current, and a written closure needs no current session.
		// #2016, the one exception: a refused close is not history until the store has accepted
		// it or the cashier has abandoned it, so a refused (`failed`) close stays current. So does
		// a session whose status POST was refused while its closure is unaccepted (a refused
		// abandon), at whatever status it holds, until the next refresh.
		data?.active.find((row) => row.sync_status === 'failed' && unacceptedClosure(row.id)) ??
		data?.closed.find(
			(row) =>
				row.closure_id === row.id &&
				row.sync_status !== 'synced' &&
				(!data.closureRows.some((closure) => closure.id === row.id) ||
					(row.sync_status === 'failed' && unacceptedClosure(row.id)))
		) ??
		null;
	// Only an open session can be overdue; its opening fixes which close it is due at.
	const openedAt = session?.status === 'open' ? session.opened_at_gmt : null;
	usePastCloseClock(closeTime, openedAt, timezone);
	/**
	 * The store refused this till's close (#2016): the close came back `failed` and no refresh
	 * has reached the store (a), or the session is at counting or open with this till's closure
	 * still unaccepted (b): the store's row reopened it at counting, or the cashier went back to
	 * selling, refused or not. A refused override is `approval_required`, not this.
	 */
	const refusedClose =
		!!session &&
		((session.status === 'closed' && session.sync_status === 'failed') ||
			(['counting', 'open'].includes(session.status) &&
				!session.approval_required &&
				session.server_status !== 'closed' &&
				unacceptedClosure(session.id)));
	const entries = data?.entries.filter((row) => row.session_id === session?.id) ?? [];
	/**
	 * Refused cash outlives the session it was recorded against. Scoping it to the current
	 * session hid it the moment the register closed, even though the row is still the only
	 * record that the cash moved and the server still accepts a movement created before
	 * counting started (`Cash_Movement_Store::accepts`).
	 *
	 * Scoped by REGISTER, not left unscoped: the movements collection spans every register, so
	 * dropping the filter entirely would put another till's refused cash on this one's pane.
	 */
	const registerSessionIds = new Set(
		[...(data?.active ?? []), ...(data?.closed ?? [])].map((row) => row.id)
	);
	const refusedMovements =
		data?.entries.filter(
			(row) => row.sync_status === 'failed' && registerSessionIds.has(row.session_id)
		) ?? [];
	const orders =
		data?.orders.hits.filter(
			({ record }) =>
				record.payload.meta_data?.some(
					({ key, value }: { key?: string; value?: unknown }) =>
						key === POS_META_KEYS.session && value === session?.id
				) || readLedger(record.payload.meta_data).some((row) => row.session_id === session?.id)
		) ?? [];
	const accountingOrders = data?.orders.hits ?? [];
	const drawerInput = session
		? {
				session,
				movements: entries,
				// Each row keeps its order, so a split cash payment counts as one cash sale.
				ledgerRowsBySession: accountingOrders.flatMap(({ record }) =>
					readLedger(record.payload.meta_data).map((row) => ({ ...row, order: record.uuid }))
				),
				refundRecords: data?.refundRecords,
			}
		: undefined;
	const baselineHas = baselineContains(
		accountingOrders.map(({ record }) => record),
		data?.refundSources ?? [],
		entries,
		session
	);
	// Snapshot-counted voids debit the baseline even offline. Other in-place edits keep
	// the baseline plus deltas until refreshed rather than inventing their prior state.
	// Compare each row's snapshot version; older plugins fall back to the snapshot time.
	const versions = [...(session?.server_ledger_rows ?? []), ...(session?.server_refunds ?? [])];
	const baselineVersion = (id: string | number | undefined) =>
		versions.find((row) => row.id === id)?.updated_at_gmt ?? session?.server_expected_at;
	const baselineStale =
		!!drawerInput?.ledgerRowsBySession.some((row) => {
			if (!baselineHas?.(row.id)) return false;
			const snapshot = session?.server_ledger_rows?.find(({ id }) => id === row.id);
			// Tokens are server-owned: compare them, never reconstruct their financial hash.
			return snapshot?.version !== undefined
				? row.version !== snapshot.version
				: afterBaseline(row.updated_at_gmt, baselineVersion(row.id));
		}) ||
		(data?.refundRecords ?? []).some(
			(row) =>
				baselineHas?.(row.id) && afterBaseline(row.date_modified_gmt, baselineVersion(row.id))
		);
	// Ask the existing bridge to refresh external state; it debounces requests across consumers.
	React.useEffect(() => {
		if (baselineStale && storeDB && binding.registerId)
			sessionRefreshRequests.next({ storeDB, registerId: binding.registerId });
	}, [baselineStale, storeDB, binding.registerId]);
	const expected = drawerInput ? deriveExpected(drawerInput, baselineHas) : {};
	// The same anchor as `expected`, so the strip's terms add up to its total.
	const terms = drawerInput ? deriveDrawerTerms(drawerInput, baselineHas) : undefined;
	// The emitted document: a render from an emission can precede the writer's cache assignment.
	const bucket = registerDoc?.sites[site.uuid!]?.registers?.[binding.registerId!];
	const live = registerDoc ? bucket?.live : readLiveSession(site.uuid!, binding.registerId!);
	const figuresPending =
		!!session && session.server_expected_at == null && !!live?.seeded_in.includes(storeDB.name);
	const lastClosure =
		data?.closureRows.sort((a, b) => b.closed_at.localeCompare(a.closed_at))[0] ?? null;
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
	const overdue =
		!!session && session.status === 'open' && isPastClose(closeTime, openedAt, timezone);
	return {
		session,
		/**
		 * `session` is null both for a closed register and before the combined query first
		 * emits; only this tells them apart, so an open register never flashes as closed.
		 */
		loaded: !sessionsOn || data !== null,
		movements: entries,
		refusedMovements,
		expected,
		terms,
		varianceThreshold,
		unsyncedCount:
			orders.filter(({ record }) => pendingMoney(record)).length +
			entries.filter((row) => row.sync_status !== 'synced').length +
			// The closure's own count (session-store.ts): a held retry (#3304) is `failed` until its
			// closure is rewritten: still unsynced.
			(['pending', 'failed'].includes(session?.sync_status ?? '') ? 1 : 0),
		sessionsOn,
		overdue,
		/** The store's HH:MM close time; what `overdue` is measured against. */
		closeTime,
		binding,
		blind: !capabilities?.includes('view_woocommerce_pos_reports'),
		figuresPending,
		/** This device owns the cached count mark, not another till. */
		countingHere: !!live?.counting_here,
		// The close cleared the count mark; a close the store refused is still this till's count.
		countingElsewhere:
			!!session && session.status === 'counting' && !live?.counting_here && !refusedClose,
		refusedClose,
		countingBy,
		// The refresh clears the live record as the remote close lands; the marker outlives it.
		closedElsewhere:
			!session &&
			lastClosure &&
			(registerDoc
				? bucket?.closed_elsewhere
				: readClosedElsewhere(site.uuid!, binding.registerId!)
			)?.session_id === lastClosure.id
				? { by: lastClosure.closed_by, at: lastClosure.closed_at }
				: null,
		salesCount:
			session?.server_sales_count != null && session.server_expected_at != null
				? session.server_sales_count +
					orders.filter(({ record }) =>
						outsideBaseline(record, session.server_expected_at, session.server_order_ids)
					).length
				: orders.length,
		lastClosure,
		lastClosed:
			data?.closed.sort((a, b) =>
				(b.closed_at_gmt ?? '').localeCompare(a.closed_at_gmt ?? '')
			)[0] ?? null,
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
