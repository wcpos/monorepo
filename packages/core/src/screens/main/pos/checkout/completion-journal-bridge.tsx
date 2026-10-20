import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { recoverMoneyCommands, useQueryRuntime } from '@wcpos/query';
import { readResidentOrder } from '@wcpos/query/record-readers';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { DRAINABLE_SCOPE_DATABASE_GENERATION, scopeDatabaseName } from '@wcpos/sync-core';
import {
	awaitLegacyUnsentReport,
	legacyUnsentOrderUuids,
	legacyUnsentReportUncountable,
} from '@wcpos/utils/unsent-changes';
import {
	failCompletionAttempt,
	pendingCompletions,
	resolveCompletionAttempt,
} from '@wcpos/query/store-local';

import { useStoreSession } from '../../../../contexts/app-state';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import {
	getTerminalPaymentsServiceStartVersion,
	subscribeTerminalPaymentsServiceStart,
} from '../../../../services/terminal-payments';
import { useSaleContext } from './hooks/use-sale-context';
import { completeSale, isSaleComplete, refreshOrderRecord } from './sale-completion';

const logger = getLogger(['wcpos', 'pos', 'checkout']);

/**
 * How long a replay waits for the previous-generation drain to report before it
 * decides an order is missing. The drain sends one write-drain tick and carries
 * open carts over; on a healthy store that settles in a few seconds even with a
 * full queue. Thirty seconds is well clear of that and still well inside one
 * session, so a completion the drain is about to make resident is not counted
 * as a missed start. An offline till's drain waits for the store, so the bound
 * — not the report — ends that wait.
 */
const LEGACY_DRAIN_REPORT_WAIT_MS = 30_000;

/**
 * Replays outstanding finishes at store-session start, never collecting money. First, at start
 * and on every reconnect, it re-sends the money commands that were sent and never answered
 * (ADR 0040 §1.3): a pull can adopt a sale completed by such a command and take it out of the
 * open orders, so no tender is left to press Try again. An answer that completes the sale then
 * finishes it here (receipt and audit) through the completion journal.
 */
export function SaleCompletionBridge(): null {
	const { storeDB } = useStoreSession();
	const manager = useQueryRuntime();
	const ctx = useSaleContext();
	const http = useRestHttpClient();
	const httpRef = React.useRef(http);
	const online = useOnlineStatus().status === 'online-website-available';
	const onlineRef = React.useRef(online);
	React.useLayoutEffect(() => {
		httpRef.current = http;
	}, [http]);
	const version = React.useSyncExternalStore(
		subscribeTerminalPaymentsServiceStart,
		getTerminalPaymentsServiceStartVersion,
		getTerminalPaymentsServiceStartVersion
	);
	const session = React.useRef<{
		storeDB: typeof storeDB;
		manager: typeof manager;
		ctx: typeof ctx;
		startVersion: number;
		stopped: boolean;
		reconnect: () => void;
	} | null>(null);

	// A reconnect re-sends what the outage left unanswered, then finishes what it completed.
	React.useEffect(() => {
		const was = onlineRef.current;
		onlineRef.current = online;
		if (online && !was) session.current?.reconnect();
	}, [online]);

	// The journal belongs to the external store session, not a checkout screen.
	React.useEffect(() => {
		// The preceding terminal bridge starts in its effect, after this render's snapshot.
		const startVersion = getTerminalPaymentsServiceStartVersion();
		const previous = session.current;
		if (
			previous?.storeDB === storeDB &&
			previous.manager === manager &&
			previous.startVersion === startVersion
		) {
			// Context changes and StrictMode reconnect the same run, never start another.
			previous.ctx = ctx;
			previous.stopped = false;
			return () => {
				previous.stopped = true;
			};
		}
		const current = { storeDB, manager, ctx, startVersion, stopped: false, reconnect: () => {} };
		session.current = current;
		/**
		 * The ACTIVE scope's previous-generation database — the only report this replay waits on.
		 * Resolved by waiting for the engine's active scope, not by reading it once: on a cold boot
		 * the bridge mounts before the engine's open completes, and deciding "no legacy database"
		 * then would count a missed start before the drain could carry the order over. Bounded
		 * like the report wait.
		 *
		 * Two outcomes, kept apart: `resolved` (an active scope, or an engine with no scope to
		 * give — none to wait on, countable) and `unknown` (the lookup rejected or outlasted the
		 * bound — the order may be waiting in a v5 we could not name, so it is NOT countable).
		 */
		type LegacyLookup = { kind: 'resolved'; database: string | null } | { kind: 'unknown' };
		const activeLegacyDatabase = async (): Promise<LegacyLookup> => {
			if (!manager.engine) return { kind: 'resolved', database: null };
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				const active =
					manager.engine.active() ??
					(await Promise.race([
						manager.engine.whenActive(),
						new Promise<'timed-out'>((resolve) => {
							timer = setTimeout(() => resolve('timed-out'), LEGACY_DRAIN_REPORT_WAIT_MS);
						}),
					]));
				if (active === 'timed-out') return { kind: 'unknown' };
				return {
					kind: 'resolved',
					database: scopeDatabaseName(active.identity, {
						generation: DRAINABLE_SCOPE_DATABASE_GENERATION,
					}),
				};
			} catch {
				return { kind: 'unknown' };
			} finally {
				if (timer !== undefined) clearTimeout(timer);
			}
		};
		// Awaited once per replay, and only when an order is missing: a resident order never waits.
		// `unknown`: the active scope could not be resolved, or its report did not arrive, within the
		// bound. The replay goes on, but whether that database holds an order is UNKNOWN — read like
		// an uncountable report, never as "nothing kept" (three slow starts must not abandon a
		// completion it still holds).
		let legacyReport: Promise<{ database: string | null; unknown: boolean }> | null = null;
		const warnUnreported = () =>
			logger.warn('Replaying sale completions without the previous database version report', {
				context: { waitedMs: LEGACY_DRAIN_REPORT_WAIT_MS },
			});
		const legacyDrainReported = () =>
			(legacyReport ??= (async () => {
				const lookup = await activeLegacyDatabase();
				if (lookup.kind === 'unknown') {
					if (!current.stopped) warnUnreported();
					return { database: null, unknown: true };
				}
				const { database } = lookup;
				if (database === null || current.stopped) return { database, unknown: false };
				const result = await awaitLegacyUnsentReport(database, LEGACY_DRAIN_REPORT_WAIT_MS);
				if (result === 'timed-out') warnUnreported();
				return { database, unknown: result === 'timed-out' };
			})());
		const findOrder = async (uuid: string) => await readResidentOrder(manager, uuid);
		/** The orders whose unanswered commands a re-send has now answered. */
		const recover = async (): Promise<ReadonlySet<string>> => {
			try {
				const recovered = await recoverMoneyCommands(manager, storeDB, {
					post: (url, body) => httpRef.current.post(url, body),
				});
				return new Set(
					recovered.filter(({ answers }) => answers.length > 0).map(({ orderUuid }) => orderUuid)
				);
			} catch (error) {
				logger.debug('Could not re-send unanswered money commands', {
					context: { error: String(error) },
				});
				return new Set();
			}
		};
		const replay = async (only?: ReadonlySet<string>) => {
			const pending = await pendingCompletions(storeDB);
			for (const [uuid, attempt] of Object.entries(pending)) {
				if (current.stopped) return;
				if (only && !only.has(uuid)) continue;
				try {
					let resident = await findOrder(uuid);
					if (current.stopped) return;
					if (!resident) {
						// The previous-generation drain may be about to make it resident (a carried-over
						// cart): wait for its report, bounded, then look again.
						await legacyDrainReported();
						if (current.stopped) return;
						resident = await findOrder(uuid);
						if (current.stopped) return;
					}
					if (!resident) {
						// A kept previous-generation database still holds work for THIS order — or the active
						// scope's one could not be counted (it failed to open, or its report did not arrive
						// within the bound), so it MAY: either way
						// the order is not resident YET, which is not a missed start, and abandoning it would
						// drop a captured payment's completion. A later start with a countable report counts.
						const legacy = await legacyDrainReported();
						if (current.stopped) return;
						// Only the ACTIVE scope's database is asked: a uuid another scope's v5 keeps says
						// nothing about this one.
						const keptInLegacyDatabase =
							legacy.unknown ||
							(legacy.database !== null &&
								(legacyUnsentOrderUuids(legacy.database).has(uuid) ||
									legacyUnsentReportUncountable(legacy.database)));
						await failCompletionAttempt(storeDB, uuid, 'order_not_resident', {
							expectAt: attempt.at,
							missingStart: !keptInLegacyDatabase,
						});
						if (current.stopped) return;
						if (!keptInLegacyDatabase && (attempt.missingStarts ?? 0) + 1 >= 3) {
							await resolveCompletionAttempt(storeDB, uuid, attempt.at);
							logger.warn('Pending sale completion abandoned: order not resident', {
								code: ERROR_CODES.PAYMENT_CAPTURED_ORDER_UNFINISHED,
								context: {
									type: 'checkout.order-refresh',
									reason: 'completion-abandoned',
									orderUUID: uuid,
								},
							});
						}
						continue;
					}
					let refreshed = false;
					const payload = resident.getLatest().payload;
					// The stored status the attempt journaled settles the replay as the pay window would.
					const replay = {
						source: 'replay' as const,
						...(attempt.settledOrderGateway !== undefined
							? { settledOrderGateway: attempt.settledOrderGateway }
							: {}),
						...(attempt.settledOrderStatus != null
							? { settledOrderStatus: attempt.settledOrderStatus }
							: {}),
						// A pay-page attempt's catalog: judged by the gateway the resident order carries.
						...(attempt.settledOrderStatuses
							? { settledOrderStatuses: attempt.settledOrderStatuses }
							: {}),
					};
					if (
						payload.status !== 'cancelled' &&
						!isSaleComplete(replay, current.ctx.dp, payload) &&
						payload.id
					) {
						// One bounded targeted GET per pending unpaid order at start; no second GET in the owner.
						try {
							// Only a confirmed refresh may count towards "unpaid": a timed-out, failed
							// or undelivered pull leaves the cached row suspect, so the attempt is kept
							// for the next replay rather than consuming one of the three unpaid starts.
							const outcome = await refreshOrderRecord(manager, payload.id);
							if (outcome !== 'refreshed') throw new Error(`completion_refresh_${outcome}`);
							refreshed = true;
						} catch (error) {
							await failCompletionAttempt(storeDB, uuid, error, { expectAt: attempt.at });
							continue;
						}
						if (current.stopped) return;
					}
					if (!isSaleComplete(replay, current.ctx.dp, resident.getLatest().payload)) {
						const cancelled = resident.getLatest().payload.status === 'cancelled';
						const count = cancelled ? 0 : (attempt.unpaidStarts ?? 0) + 1;
						// A resident refresh can report success after HTTP failure. Give the normal
						// orders pull between starts time to reveal payment before deciding unpaid.
						if (!cancelled)
							await failCompletionAttempt(storeDB, uuid, 'unpaid', {
								expectAt: attempt.at,
								unpaidStart: true,
							});
						if (cancelled || count >= 3) await resolveCompletionAttempt(storeDB, uuid, attempt.at);
						logger.debug('Sale completion replay skipped: order is not completing', {
							context: { orderUUID: uuid, reason: cancelled ? 'cancelled' : 'unpaid', count },
						});
					} else {
						await completeSale(
							{ ...current.ctx, actor: attempt.actor },
							resident,
							{ ...replay, ...(refreshed ? { refreshed } : {}) },
							{ host: 'background' }
						);
					}
				} catch (error) {
					// The owner retains finishing errors. Leave them for the next session.
					logger.debug('Sale completion replay failed', {
						context: { orderUUID: uuid, error: String(error) },
					});
				}
			}
		};
		// One run at a time: a reconnect during the start's replay waits for it.
		let queue: Promise<void> = Promise.resolve();
		const run = (task: () => Promise<void>) => {
			queue = queue.then(task).catch((error: unknown) => {
				logger.debug('Could not read pending sale completions', {
					context: { error: String(error) },
				});
			});
		};
		run(async () => {
			if (onlineRef.current) await recover();
			if (!current.stopped) await replay();
		});
		current.reconnect = () =>
			run(async () => {
				if (current.stopped) return;
				const answered = await recover();
				if (answered.size > 0 && !current.stopped) await replay(answered);
			});
		return () => {
			current.stopped = true;
		};
	}, [storeDB, manager, ctx, version]);
	return null;
}
