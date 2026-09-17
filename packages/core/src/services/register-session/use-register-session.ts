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
	observeEngineQuery,
	useDocField,
	useQueryRuntime,
} from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { readLedger, toMinor } from '@wcpos/order-math';
import { mintRemoteId } from '@wcpos/sync-core';
import type { RefundDocumentType, WPCredentialsDocument } from '@wcpos/database';
import type { RequirementHandle } from '@wcpos/sync-engine';

import { useStoreDay } from '../../hooks/use-store-day';
import { attempt, useRegisterActor } from './audit';
import { useStoreSession } from '../../contexts/app-state';
import { useRegisterBinding } from '../register/use-register-binding';
import { deriveExpected } from './expected';
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

export function useRegisterSession() {
	const missingParentKey = React.useRef('');
	const anchorInvalidationPending = React.useRef(false);
	const [accountingChanges] = React.useState(() => new Subject<void>());
	const pendingParents = React.useRef<RequirementHandle[]>([]);
	const latestAccounting = React.useRef<Pick<
		Parameters<typeof actions.writeClosure>[0],
		'orders' | 'refundRecords'
	> | null>(null);
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
					return of({ orders: { hits: [] as never[] }, refundRecords: [] as RefundDocumentType[] });
				let previousRefunds: string | undefined;
				return observeEngineQuery(engine, locale, {
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
						return observeEngineQuery(engine, locale, {
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
									? observeEngineQuery(engine, locale, {
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
									}))
								);
							})
						);
					}),
					tap((accounting) => {
						const allocations = accounting.orders.hits
							.flatMap(({ record }) => readLedger(record.payload.meta_data))
							.filter((row) => row.refunds?.length || toMinor(row.refunded_amount, 4) > 0)
							.map(({ id, session_id, kind, method_id, status, refunded_amount, refunds }) => ({
								id,
								session_id,
								kind,
								method_id,
								status,
								refunded_amount,
								refunds,
							}));
						const signature = JSON.stringify([accounting.refundRecords, allocations]);
						const changed =
							previousRefunds === undefined
								? accounting.refundRecords.length > 0
								: signature !== previousRefunds;
						previousRefunds = signature;
						if (changed) anchorInvalidationPending.current = true;
						latestAccounting.current = {
							orders: accounting.orders.hits.map(({ record }) => record),
							refundRecords: accounting.refundRecords,
						};
						accountingChanges.next();
					}),
					concatMap(async (accounting) => {
						// Close must derive while the persisted anchor is still being cleared.
						try {
							if (anchorInvalidationPending.current && current.getLatest().server_expected) {
								await current.getLatest().incrementalPatch({ server_expected: null });
							}
							anchorInvalidationPending.current = false;
						} catch (error) {
							logger.warn(
								'Register session anchor invalidation failed; close will derive accounting',
								{
									context: { sessionId: current.id, error: getErrorMessage(error) },
								}
							);
						}
						return accounting;
					})
				);
			})
		);
		return combineLatest([
			active$,
			closed$,
			movements.find().$,
			accounting$,
			timer(0, 60_000),
			closures.find({ selector: { register_id: binding.registerId } }).$,
		]).pipe(
			map(([active, closed, entries, accounting, , closureRows]) => ({
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
	// 'failed' counts as outstanding, not settled: the server never took the row, so falling
	// back to its expected total drops the movement and hands the cashier the variance.
	const localPending =
		session?.sync_status !== 'synced' ||
		entries.some((row) => row.sync_status !== 'synced') ||
		orders.some(({ record }) => record.local.dirty);
	const accountingOrders = data?.orders.hits ?? [];
	const expected = session
		? !localPending && session.server_expected
			? session.server_expected
			: deriveExpected({
					session,
					movements: entries,
					ledgerRowsBySession: accountingOrders.flatMap(({ record }) =>
						readLedger(record.payload.meta_data)
					),
					refundRecords: data?.refundRecords,
				})
		: {};
	const now = new Date();
	const [hour, minute] = String(closeTime ?? '')
		.split(':')
		.map(Number);
	const overdue =
		!!session &&
		session.status === 'open' &&
		!!closeTime &&
		now.getTime() >
			new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).getTime();
	return {
		session,
		movements: entries,
		refusedMovements,
		expected,
		varianceThreshold,
		unsyncedCount:
			orders.filter(({ record }) => record.local.dirty).length +
			entries.filter((row) => row.sync_status !== 'synced').length +
			(session?.sync_status === 'pending' ? 1 : 0),
		sessionsOn,
		overdue,
		binding,
		blind: !capabilities?.includes('view_woocommerce_pos_reports'),
		salesCount:
			!localPending && session?.server_sales_count != null
				? session.server_sales_count
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
				logger.info('Register session opened', {
					actor,
					terminal: { operationId: row.id.replace(/-/g, '') },
					context: {
						type: 'register.session-opened',
						sessionId: row.id,
						registerId: row.register_id,
						amount: row.counted_float,
						variance: row.opening_variance,
					},
				});
				return row;
			},
			startCounting: async () => {
				const row = await actions.startCounting(sessions!, session!.id);
				logger.info('Register session counting started', {
					actor,
					terminal: attempt(),
					context: {
						type: 'register.counting-started',
						sessionId: row.id,
						registerId: row.register_id,
					},
				});
				return row;
			},
			backToSelling: async () => {
				const row = await actions.backToSelling(sessions!, session!.id);
				logger.info('Register session counting abandoned', {
					actor,
					terminal: attempt(),
					context: {
						type: 'register.counting-abandoned',
						sessionId: row.id,
						registerId: row.register_id,
					},
				});
				return row;
			},
			closeSession: async (input: { counted: Record<string, string> }) => {
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
					tillExpected:
						!localPending &&
						!anchorInvalidationPending.current &&
						latestSession.server_expected &&
						!refundRecords?.length
							? latestSession.server_expected
							: undefined,
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
				logger.info('Register session closed', {
					actor,
					terminal: { operationId: closure.id.replace(/-/g, '') },
					context: {
						type: 'register.session-closed',
						sessionId: closed.id,
						registerId: closed.register_id,
						closureId: closure.id,
						counted: closure.counted,
						variance: closure.variance,
					},
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
				if (row.type === 'no_sale') {
					// A no-sale is an action the cashier is audited on even when no drawer
					// kick is configured or the kick fails, so it has its own row here rather
					// than riding on `register.drawer-opened`.
					logger.info('Register no-sale recorded', {
						actor,
						terminal: { operationId: row.id.replace(/-/g, '') },
						context: {
							type: 'register.no-sale-recorded',
							sessionId: row.session_id,
							registerId: binding.registerId,
							movementId: row.id,
						},
					});
					return row;
				}
				logger.info('Register cash movement recorded', {
					actor,
					terminal: { operationId: row.id.replace(/-/g, '') },
					context: {
						type: 'register.movement-recorded',
						sessionId: row.session_id,
						registerId: binding.registerId,
						movementId: row.id,
						movementType: row.type,
						amount: row.amount,
					},
				});
				return row;
			},
			voidMovement: async (id: string) => {
				await actions.requireOpenSession(sessions, binding.registerId, true);
				const row = await actions.voidMovement(movements!, id, wpCredentials.id ?? 0);
				logger.info('Register cash movement voided', {
					actor,
					terminal: { operationId: row.id.replace(/-/g, '') },
					context: {
						type: 'register.movement-voided',
						sessionId: row.session_id,
						registerId: binding.registerId,
						movementId: row.id,
						movementType: row.type,
						amount: row.amount,
						voids: id,
					},
				});
				return row;
			},
			retryMovement: async (id: string) => {
				const row = await actions.retryMovement(movements!, id);
				logger.info('Register cash movement retry requested', {
					actor,
					terminal: attempt(),
					context: {
						type: 'register.movement-retrying',
						sessionId: row.session_id,
						registerId: binding.registerId,
						movementId: row.id,
					},
				});
				return row;
			},
		},
	};
}
