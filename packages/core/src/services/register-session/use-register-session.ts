import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import {
	combineLatest,
	concatMap,
	distinctUntilChanged,
	finalize,
	map,
	of,
	Subject,
	switchMap,
	tap,
	timer,
} from 'rxjs';

import {
	declareRequirements,
	type EngineRecord,
	observeEngineQuery,
	useDocField,
	useQueryRuntime,
} from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { readLedger } from '@wcpos/order-math';
import { mintRemoteId } from '@wcpos/sync-core';
import type { RefundDocumentType, WPCredentialsDocument } from '@wcpos/database';
import { hasPendingLocalWork, type RequirementHandle } from '@wcpos/sync-engine';

import { useStoreDay } from '../../hooks/use-store-day';
import { recordRegisterFact, useRegisterActor } from './audit';
import { useStoreSession } from '../../contexts/app-state';
import { useRegisterBinding } from '../register/use-register-binding';
import { deriveDrawerTerms, deriveExpected } from './expected';
import { sessionRefreshRequests } from './refresh';
import * as actions from './session-store';
import {
	useCashMovementCollection,
	useClosureCollection,
	useRegisterSessionCollection,
} from './use-register-session-collections';

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
	orders: readonly EngineRecord<'orders'>[],
	refunds: readonly EngineRecord<'refunds'>[],
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
	const missingParentKey = React.useRef('');
	const [accountingChanges] = React.useState(() => new Subject<void>());
	const pendingParents = React.useRef<RequirementHandle[]>([]);
	const latestAccounting = React.useRef<{
		orders: EngineRecord<'orders'>[];
		refundRecords: RefundDocumentType[];
		refundSources: EngineRecord<'refunds'>[];
	} | null>(null);
	const { store, wpCredentials, userDB, site } = useStoreSession();
	const actor = useRegisterActor();
	const { today, timezone } = useStoreDay();
	const { engine, locale } = useQueryRuntime();
	const binding = useRegisterBinding();
	const sessions = useRegisterSessionCollection();
	const movements = useCashMovementCollection();
	const closures = useClosureCollection();
	const sessionsOn = !!useDocField(store, (value) => value.register_sessions);
	const varianceThreshold = useDocField(store, (value) => value.variance_threshold);
	const closeTime = useDocField(store, (value) => value.expected_close_time);
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities);
	const source = React.useMemo(() => {
		if (!sessions || !movements || !closures || !binding.registerId || !sessionsOn) return of(null);
		const active$ = sessions.find({
			selector: { register_id: binding.registerId, status: { $in: ['open', 'counting'] } },
		}).$;
		const closed$ = sessions.find({
			selector: { register_id: binding.registerId, status: 'closed' },
		}).$;
		// An older order can be paid in this session too, so the bound is the modified date,
		// not the birth date; ledger provenance then binds it.
		const accounting$ = combineLatest([active$, closed$]).pipe(
			map(
				([active, closed]) =>
					active.find((row) => row.sync_status !== 'failed') ??
					closed.find((row) => row.closure_id === row.id && row.sync_status !== 'synced')
			),
			distinctUntilChanged((previous, current) => previous?.id === current?.id),
			// eslint-disable-next-line react-hooks/refs -- RxJS invokes this on subscription emissions, not while constructing the observable during render.
			switchMap((current) => {
				if (!current)
					return of({
						orders: { hits: [] as never[] },
						refundRecords: [] as RefundDocumentType[],
						refundSources: [] as EngineRecord<'refunds'>[],
					});
				return observeEngineQuery(engine, {
					collection: 'orders',
					selector: { date_modified_gmt: { $gte: current.opened_at_gmt } },
					limit: Number.MAX_SAFE_INTEGER,
				}).pipe(
					switchMap((recent) => {
						const ids = recent.hits.flatMap(({ record }) =>
							readLedger(record.payload.meta_data)
								.filter((row) => row.session_id === current.id)
								.flatMap((row) => (row.refunds ?? []).map(({ id }) => id))
						);
						return observeEngineQuery(engine, {
							collection: 'refunds',
							selector: {
								$or: [{ session_id: current.id }, { id: { $in: ids } }],
							},
							limit: Number.MAX_SAFE_INTEGER,
						}).pipe(
							switchMap((refunds) => {
								const refundRecords = refunds.hits.map(
									({ record }) => record.payload as RefundDocumentType
								);
								const parentIds = refundRecords
									.filter((refund) =>
										refund.meta_data?.some(
											({ key, value }) => key === '_wcpos_session' && value === current.id
										)
									)
									.map((refund) => refund.parent_id);
								const parents$: ReturnType<typeof observeEngineQuery> = parentIds.length
									? observeEngineQuery(engine, {
											collection: 'orders',
											selector: { id: { $in: parentIds } },
											limit: Number.MAX_SAFE_INTEGER,
										})
									: of({ count: 0, hits: [] });
								let missingKey = '';
								let parentRequirements: RequirementHandle[] = [];
								return parents$.pipe(
									tap((parents) => {
										const held = new Set(parents.hits.map(({ record }) => record.payload.id));
										const missing = [...new Set(parentIds)]
											.filter((id) => !held.has(id))
											.sort((a, b) => a - b);
										const key = missing.join(',');
										missingParentKey.current = key;
										if (key === missingKey) return;
										missingKey = key;
										parentRequirements.forEach((handle) => handle.release());
										parentRequirements = missing.length
											? declareRequirements(engine, [
													{
														id: 'register-session:refund-parents',
														kind: 'targeted-records',
														collection: 'orders',
														remoteIds: missing.map((id) => mintRemoteId(id, 'refund parent')),
													},
												])
											: [];
										pendingParents.current = parentRequirements;
									}),
									finalize(() => {
										parentRequirements.forEach((handle) => handle.release());
										if (pendingParents.current === parentRequirements) pendingParents.current = [];
									}),
									map((parents) => ({
										orders: {
											hits: [
												...new Map(
													[...recent.hits, ...parents.hits].map((hit) => [hit.record.uuid, hit])
												).values(),
											],
										},
										refundRecords,
										refundSources: refunds.hits.map(({ record }) => record),
									}))
								);
							})
						);
					}),
					tap((accounting) => {
						latestAccounting.current = {
							orders: accounting.orders.hits.map(({ record }) => record),
							refundRecords: accounting.refundRecords,
							refundSources: accounting.refundSources,
						};
						accountingChanges.next();
					}),
					// Preserve the existing asynchronous accounting emission boundary.
					concatMap(async (accounting) => accounting)
				);
			})
		);
		return combineLatest([
			active$,
			closed$,
			movements.find().$,
			accounting$,
			closures.find({ selector: { register_id: binding.registerId } }).$,
		]).pipe(
			map(([active, closed, entries, accounting, closureRows]) => ({
				sessions,
				registerId: binding.registerId,
				active,
				closed,
				entries,
				...accounting,
				closureRows,
			}))
		);
	}, [
		sessions,
		movements,
		closures,
		binding.registerId,
		sessionsOn,
		engine,
		locale,
		accountingChanges,
	]);
	const observed = useObservableState(source, null);
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
		observed?.sessions === sessions && observed?.registerId === binding.registerId && sessionsOn
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
						key === '_wcpos_session' && value === session?.id
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
	const terms = drawerInput ? deriveDrawerTerms(drawerInput) : undefined;
	const baselineHas = baselineContains(
		accountingOrders.map(({ record }) => record),
		data?.refundSources ?? [],
		entries,
		session?.server_expected_at,
		session?.server_movement_ids,
		session?.server_ledger_row_ids,
		session?.server_refund_ids
	);
	// Offline edits of synced captured legs are rare (a void needs the server). Keep
	// the baseline plus other deltas until refreshed rather than inventing prior state:
	// baseline-known rows cancel in deriveUnsyncedDelta even after amount/status edits.
	// Compare each row's snapshot version; older plugins fall back to the snapshot time.
	const versions = [...(session?.server_ledger_rows ?? []), ...(session?.server_refunds ?? [])];
	const baselineVersion = (id: string | number | undefined) =>
		versions.find((row) => row.id === id)?.updated_at_gmt ?? session?.server_expected_at;
	const baselineStale =
		!!drawerInput?.ledgerRowsBySession.some(
			(row) => baselineHas?.(row.id) && afterBaseline(row.updated_at_gmt, baselineVersion(row.id))
		) ||
		(data?.refundRecords ?? []).some(
			(row) =>
				baselineHas?.(row.id) && afterBaseline(row.date_modified_gmt, baselineVersion(row.id))
		);
	// Ask the existing bridge to refresh external state; it debounces requests across consumers.
	React.useEffect(() => {
		if (baselineStale && sessions && binding.registerId)
			sessionRefreshRequests.next({ sessions, registerId: binding.registerId });
	}, [baselineStale, sessions, binding.registerId]);
	const expected = drawerInput ? deriveExpected(drawerInput, baselineHas) : {};
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
		binding,
		blind: !capabilities?.includes('view_woocommerce_pos_reports'),
		salesCount:
			session?.server_sales_count != null && session.server_expected_at != null
				? session.server_sales_count +
					orders.filter(({ record }) =>
						outsideBaseline(record, session.server_expected_at, session.server_order_ids)
					).length
				: orders.length,
		lastClosure:
			data?.closureRows.sort((a, b) => b.closed_at.localeCompare(a.closed_at))[0] ?? null,
		lastClosed:
			data?.closed.sort((a, b) =>
				(b.closed_at_gmt ?? '').localeCompare(a.closed_at_gmt ?? '')
			)[0] ?? null,
		actions: {
			openSession: async (input: { expectedFloat: string | null; countedFloat: string }) => {
				const row = await actions.openSession(sessions!, {
					...input,
					registerId: binding.registerId!,
					openedBy: wpCredentials.id ?? 0,
					businessDay: today(),
					storeId: store.id,
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
				if (!sessions || !session) throw new actions.RegisterSessionRequiredError();
				const row = await actions.startCounting(sessions, session.id);
				recordRegisterFact({
					kind: 'counting-started',
					actor,
					sessionId: row.id,
					registerId: row.register_id,
				});
				return row;
			},
			backToSelling: async () => {
				if (!sessions || !session) throw new actions.RegisterSessionRequiredError();
				const row = await actions.backToSelling(sessions, session.id);
				recordRegisterFact({
					kind: 'counting-abandoned',
					actor,
					sessionId: row.id,
					registerId: row.register_id,
				});
				return row;
			},
			closeSession: async (input: { counted: Record<string, string> }) => {
				if (!sessions || !session) throw new actions.RegisterSessionRequiredError();
				const closed =
					session!.status === 'closed'
						? session!
						: await actions.closeSession(sessions!, session!.id, {
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
				const cashiers: WPCredentialsDocument[] = await site.populate('wp_credentials');
				const actorName = (id: number | null | undefined) =>
					(id === wpCredentials.id ? wpCredentials : cashiers.find((row) => row.id === id))
						?.display_name ?? '';
				const accounting = latestAccounting.current;
				const latestSession = session!.getLatest();
				const refundRecords = accounting?.refundRecords ?? data?.refundRecords;
				const closure = await actions.writeClosure({
					closures: closures!,
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
				const id = await actions.requireOpenSession(sessions, binding.registerId, true);
				const row = await actions.recordMovement(movements!, {
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
				await actions.requireOpenSession(sessions, binding.registerId, true);
				const row = await actions.voidMovement(movements!, id, wpCredentials.id ?? 0);
				recordRegisterFact({
					kind: 'movement-voided',
					actor,
					sessionId: row.session_id,
					registerId: binding.registerId,
					movementId: row.id,
					movementType: row.type,
					amount: row.amount,
					voids: id,
				});
				return row;
			},
			retryMovement: async (id: string) => {
				const row = await actions.retryMovement(movements!, id);
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
