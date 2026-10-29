import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { combineLatest, distinctUntilChanged, filter, firstValueFrom, map, of, timer } from 'rxjs';

import { observeSiteCredentials, PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { type ReadonlyEngineRecord, useDocField, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { readLedger } from '@wcpos/order-math';
import { POS_META_KEYS } from '@wcpos/sync-core';
import { hasPendingLocalWork } from '@wcpos/sync-engine';
import {
	backToSelling,
	closeSession,
	createSessionAccountingState,
	deriveDrawerTerms,
	deriveExpected,
	markCountingHere,
	observeCashMovements,
	observeRegister$,
	observeRegisterClosures,
	observeRegisterSessions,
	observeSessionAccounting,
	openSession,
	readLiveSession,
	readMovement,
	recordLiveSession,
	recordMovement,
	RegisterSessionRequiredError,
	requireOpenSession,
	retryMovement,
	sessionRefreshRequests,
	startCounting,
	voidMovement,
	writeClosure,
} from '@wcpos/query/register-session';

import { useStoreDay } from '../../hooks/use-store-day';
import { recordRegisterFact, useRegisterActor } from './audit';
import { useStoreSession } from '../../contexts/app-state';
import { useRegisterBinding } from '../register/use-register-binding';

const logger = getLogger(['wcpos', 'registerSession']);
// A drain that has not answered in fifteen seconds is offline or stalled, and the till must
// still close; the closure then carries the fallback and the parent arrives later.
const REFUND_PARENT_WAIT_MS = 15_000;

function pendingMoney(record: { local?: unknown; remoteId?: unknown }) {
	return hasPendingLocalWork(record) || record.remoteId === null;
}

function afterBaseline(at?: string | null, baselineAt?: string | null) {
	baselineAt = baselineAt?.replace(/Z?$/, 'Z');
	return (
		!!at && !!baselineAt && Date.parse(at.endsWith('Z') ? at : `${at}Z`) > Date.parse(baselineAt)
	);
}
function outsideBaseline(
	record: {
		remoteId?: unknown;
		payload: { id?: number; date_created_gmt?: string };
	},
	baselineAt?: string | null,
	orderIds?: readonly number[] | null
) {
	if (orderIds != null) return !orderIds.some((id) => id === record.payload.id);
	return record.remoteId === null || afterBaseline(record.payload.date_created_gmt, baselineAt);
}
function baselineContains(
	orders: readonly ReadonlyEngineRecord<'orders'>[],
	refunds: readonly ReadonlyEngineRecord<'refunds'>[],
	movements: readonly { id: string }[],
	baselineAt?: string | null,
	movementIds: readonly string[] = [],
	ledgerRowIds?: readonly string[] | null,
	refundIds?: readonly number[] | null
) {
	if (!baselineAt) return undefined;
	const pending = new Set<string | number | null | undefined>([
		...refunds
			.filter((row) => outsideBaseline(row, baselineAt, refundIds))
			.map((row) => row.payload.id),
		...movements.filter((row) => !movementIds.includes(row.id)).map((row) => row.id),
		...orders.flatMap((order) =>
			readLedger(order.payload.meta_data).flatMap((row) =>
				(row.refunds ?? [])
					.filter((refund) => {
						const at = (refund as { created_at_gmt?: string }).created_at_gmt;
						return refundIds != null
							? !refundIds.includes(refund.id)
							: !at || afterBaseline(at, baselineAt);
					})
					.map(({ id }) => id)
			)
		),
		...orders.flatMap((order) =>
			readLedger(order.payload.meta_data)
				.filter((row) =>
					ledgerRowIds != null
						? !ledgerRowIds.includes(row.id)
						: afterBaseline(row.created_at_gmt, baselineAt)
				)
				.map(({ id }) => id)
		),
	]);
	return (id: string | number | null | undefined) => !pending.has(id);
}

/** Whether now is past today's `HH:MM` close time; no or unreadable close time is never past. */
function isPastClose(closeTime: string | null | undefined) {
	const [hour, minute] = String(closeTime ?? '')
		.split(':')
		.map(Number);
	if (!closeTime || !Number.isFinite(hour) || !Number.isFinite(minute)) return false;
	const now = new Date();
	return (
		now.getTime() >
		new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).getTime()
	);
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
	const [accountingState] = React.useState(createSessionAccountingState);
	const source = React.useMemo(() => {
		const sessions$ = observeRegisterSessions(storeDB, binding.registerId);
		const accounting = observeSessionAccounting(
			runtime.engine,
			sessions$.pipe(
				map((rows) =>
					rows === null
						? null
						: (rows.active.find((row) => row.sync_status !== 'failed') ??
							rows.closed.find((row) => row.closure_id === row.id && row.sync_status !== 'synced'))
				)
			),
			accountingState
		);
		const stream =
			!binding.registerId || !sessionsOn
				? of(null)
				: combineLatest([
						sessions$,
						observeCashMovements(storeDB),
						accounting.stream,
						observeRegisterClosures(storeDB, binding.registerId),
					]).pipe(
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
		return { ...accounting, stream };
		// Locale historically rebinds the reads; the close's state must survive that rebind.
	}, [storeDB, binding.registerId, sessionsOn, runtime.engine, runtime.locale, accountingState]);
	const { missingParentKey, pendingParents, accountingChanges, latestAccounting } = source;
	const observed = useObservableState(source.stream, null);
	// The clock is not in the data stream: there it re-rendered every consumer once a minute
	// with nothing changed (roadmap#423). This stream emits only when the verdict flips.
	const pastClose$ = React.useMemo(
		() =>
			timer(0, 60_000).pipe(
				map(() => isPastClose(closeTime)),
				distinctUntilChanged()
			),
		[closeTime]
	);
	// The subscription only schedules the render at the flip; the verdict is read fresh below,
	// so a close time changed mid-session never renders the previous close time's verdict for
	// the tick before the new stream emits.
	useObservableState(pastClose$, () => isPastClose(closeTime));
	const data =
		observed?.storeDB === storeDB &&
		observed?.registerId === binding.registerId &&
		observed?.isCurrent() &&
		sessionsOn
			? observed
			: null;
	const session =
		data?.active.find((row) => row.sync_status !== 'failed') ??
		// Recover only a close this till made and never got acknowledged whose closure write
		// was interrupted (closure_id stamped, no local closure row); imported closed history
		// is synced and is never current, and a written closure needs no current session.
		data?.closed.find(
			(row) =>
				row.closure_id === row.id &&
				row.sync_status !== 'synced' &&
				!data.closureRows.some((closure) => closure.id === row.id)
		) ??
		null;
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
		session?.server_expected_at,
		session?.server_movement_ids,
		session?.server_ledger_row_ids,
		session?.server_refund_ids
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
	const live = registerDoc
		? registerDoc.sites[site.uuid!]?.registers?.[binding.registerId!]?.live
		: readLiveSession(site.uuid!, binding.registerId!);
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
	const overdue = !!session && session.status === 'open' && isPastClose(closeTime);
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
			(session?.sync_status === 'pending' ? 1 : 0),
		sessionsOn,
		overdue,
		/** The store's HH:MM close time; what `overdue` is measured against. */
		closeTime,
		binding,
		blind: !capabilities?.includes('view_woocommerce_pos_reports'),
		figuresPending,
		/** This device owns the cached count mark, not another till. */
		countingHere: !!live?.counting_here,
		countingElsewhere: !!session && session.status === 'counting' && !live?.counting_here,
		countingBy,
		closedElsewhere:
			!session && lastClosure && live?.session_id === lastClosure.id && !live.counting_here
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
				const row = await startCounting(storeDB, session.id);
				const opener = readLiveSession(site.uuid!, row.register_id)?.opened_by;
				await recordLiveSession(userDB, site.uuid!, row.register_id, {
					session_id: row.id,
					status: 'counting',
					opened_at_gmt: row.opened_at_gmt,
					opened_by:
						row.opened_by == null
							? null
							: {
									id: row.opened_by,
									name:
										opener?.id === row.opened_by
											? opener.name
											: row.opened_by === wpCredentials.id
												? (wpCredentials.display_name ?? '')
												: '',
								},
					acknowledged: session.sync_status === 'synced' || session.server_status != null,
					expected_float: row.expected_float ?? null,
					counted_float: row.counted_float ?? null,
					business_day: row.business_day ?? null,
				});
				await markCountingHere(userDB, site.uuid!, row.register_id, true);
				recordRegisterFact({
					kind: 'counting-started',
					actor,
					sessionId: row.id,
					registerId: row.register_id,
				});
				return row;
			},
			backToSelling: async () => {
				if (!session) throw new RegisterSessionRequiredError();
				const row = await backToSelling(storeDB, session.id);
				const opener = readLiveSession(site.uuid!, row.register_id)?.opened_by;
				await recordLiveSession(userDB, site.uuid!, row.register_id, {
					session_id: row.id,
					status: 'open',
					opened_at_gmt: row.opened_at_gmt,
					opened_by:
						row.opened_by == null
							? null
							: {
									id: row.opened_by,
									name:
										opener?.id === row.opened_by
											? opener.name
											: row.opened_by === wpCredentials.id
												? (wpCredentials.display_name ?? '')
												: '',
								},
					acknowledged: session.sync_status === 'synced' || session.server_status != null,
					expected_float: row.expected_float ?? null,
					counted_float: row.counted_float ?? null,
					business_day: row.business_day ?? null,
				});
				recordRegisterFact({
					kind: 'counting-abandoned',
					actor,
					sessionId: row.id,
					registerId: row.register_id,
				});
				return row;
			},
			closeSession: async (input: { counted: Record<string, string> }) => {
				if (!session) throw new RegisterSessionRequiredError();
				// A seeded `counting` row skips `startCounting`; the close is the second door (§ 4.9).
				if (figuresPending) throw new Error('register_figures_pending');
				const closed =
					session!.status === 'closed'
						? session!
						: await closeSession(storeDB, session!.id, {
								...input,
								closedBy: wpCredentials.id,
								timezone,
							});
				const handles = pendingParents.current;
				if (handles.length > 0) {
					let timeout: ReturnType<typeof setTimeout> | undefined;
					let timedOut = false;
					const deadline = new Promise<void>((resolve) => {
						timeout = setTimeout(() => {
							timedOut = true;
							logger.warn('Refund parent wait timed out; closing with available accounting');
							resolve();
						}, REFUND_PARENT_WAIT_MS);
					});
					try {
						let generation = handles;
						do {
							await Promise.race([
								Promise.allSettled(generation.map((handle) => handle.ready)),
								deadline,
							]);
							if (timedOut || !missingParentKey.current) break;
							if (pendingParents.current === generation) {
								// Readiness precedes RxDB's query emission. Unrelated accounting
								// emissions must not end the wait for a changed missing-parent set.
								const key = missingParentKey.current;
								let subscription: ReturnType<typeof accountingChanges.subscribe> | undefined;
								try {
									await Promise.race([
										new Promise<void>((resolve) => {
											subscription = accountingChanges.subscribe(() => {
												if (missingParentKey.current !== key) resolve();
											});
										}),
										deadline,
									]);
								} finally {
									subscription?.unsubscribe();
								}
							}
							generation = pendingParents.current;
						} while (!timedOut && generation.length > 0);
					} finally {
						clearTimeout(timeout);
					}
				}
				const cashiers: { id?: number; display_name?: string }[] = await firstValueFrom(
					observeSiteCredentials(site).pipe(filter((value) => value !== PENDING_USER_DB_READ))
				);
				const actorName = (id: number | null | undefined) =>
					(id === wpCredentials.id ? wpCredentials : cashiers.find((row) => row.id === id))
						?.display_name ?? '';
				const accounting = latestAccounting.current;
				const latestSession = session!.getLatest();
				const refundRecords = accounting?.refundRecords ?? data?.refundRecords;
				const closure = await writeClosure({
					storeDB,
					resolveCashierName: actorName,
					timezone,
					labels: {
						register_name: binding.registerName ?? '',
						closed_by_name: actorName(closed.closed_by),
						opened_by_name: actorName(closed.opened_by),
						approved_by_name: actorName(closed.approved_by),
					},
					tillExpected: deriveExpected(
						{
							session: latestSession,
							movements: entries,
							refundRecords,
							ledgerRowsBySession: (
								accounting?.orders ?? accountingOrders.map(({ record }) => record)
							).flatMap((record) => readLedger(record.payload.meta_data)),
						},
						baselineContains(
							accounting?.orders ?? [],
							accounting?.refundSources ?? [],
							entries,
							latestSession.server_expected_at,
							latestSession.server_movement_ids,
							latestSession.server_ledger_row_ids,
							latestSession.server_refund_ids
						)
					),
					userDB,
					siteUuid: site.uuid!,
					session: closed,
					counted: input.counted.cash,
					otherTenders: Object.fromEntries(
						Object.entries(input.counted).filter(([method]) => method !== 'cash')
					),
					movements: entries,
					orders: accounting?.orders ?? accountingOrders.map(({ record }) => record),
					refundRecords,
				});
				await recordLiveSession(userDB, site.uuid!, closed.register_id, null);
				recordRegisterFact({
					kind: 'session-closed',
					actor,
					sessionId: closed.id,
					registerId: closed.register_id,
					closureId: closure.id,
					counted: closure.counted,
					variance: closure.variance,
				});
				return closure;
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
