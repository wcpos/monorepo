import * as React from 'react';

import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	moneyCommandRecovery,
	observeResidentOrders,
	type RecoveredOrder,
	RECOVERY_RETRY_DELAYS_MS,
	type ResentCommand,
	residentHoldsAnswer,
	useQueryRuntime,
} from '@wcpos/query';
import { readResidentOrder } from '@wcpos/query/record-readers';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import {
	DRAINABLE_SCOPE_DATABASE_GENERATION,
	PAYMENT_ROW_REFUSALS,
	type PaymentRowRefusal,
	scopeDatabaseName,
} from '@wcpos/sync-core';
import {
	awaitLegacyUnsentReport,
	legacyUnsentOrderUuids,
	legacyUnsentReportUncountable,
} from '@wcpos/utils/unsent-changes';
import {
	failCompletionAttempt,
	observePendingCompletions,
	pendingCompletions,
	readAwaitingAnswer,
	resolveCompletionAttempt,
} from '@wcpos/query/store-local';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { answerOf, answerReadsPaid, landAnswer } from '../commands/land-answer';
import { enqueueOrderMutation } from '../hooks/order-mutation-queue';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import {
	getTerminalPaymentsServiceStartVersion,
	subscribeTerminalPaymentsServiceStart,
} from '../../../../services/terminal-payments';
import { useSaleContext } from './hooks/use-sale-context';
import { raisePaymentRefusal } from './payments/payment-refusal-attention';
import { awaitAdoption, completeSale, isSaleComplete, refreshOrderRecord } from './sale-completion';

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

type Attempt = Awaited<ReturnType<typeof pendingCompletions>>[string];
/** The stored status the attempt journaled settles the replay as the pay window would. */
const replayOf = (attempt: Attempt) => ({
	source: 'replay' as const,
	...(attempt.settledOrderGateway !== undefined
		? { settledOrderGateway: attempt.settledOrderGateway }
		: {}),
	...(attempt.settledOrderStatus != null ? { settledOrderStatus: attempt.settledOrderStatus } : {}),
	// A pay-page attempt's catalog: judged by the gateway the resident order carries.
	...(attempt.settledOrderStatuses ? { settledOrderStatuses: attempt.settledOrderStatuses } : {}),
});

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
	const t = useT();
	const tRef = React.useRef(t);
	const { byId: methods } = usePaymentMethods();
	const methodsRef = React.useRef(methods);
	const online = useOnlineStatus().status === 'online-website-available';
	const onlineRef = React.useRef(online);
	React.useLayoutEffect(() => {
		httpRef.current = http;
		tRef.current = t;
		methodsRef.current = methods;
	}, [http, t, methods]);
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
		/** The money command recovery and its schedule: `suspend` at cleanup, `resume` on a re-run. */
		recovery: ReturnType<typeof moneyCommandRecovery>;
		/** End the adoption watch and its backoff timers. */
		disarm: () => void;
		/** Watch pending completions for sales a pull adopted (`watchAdoptions`). */
		watch: () => void;
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
			// React re-runs effects on remount and HMR; the watches and timers are re-armed so no
			// interval goes unwatched.
			previous.recovery.resume();
			previous.watch();
			return () => {
				previous.stopped = true;
				previous.recovery.suspend();
				previous.disarm();
			};
		}
		const current = {
			storeDB,
			manager,
			ctx,
			startVersion,
			stopped: false,
			reconnect: () => {},
			recovery: moneyCommandRecovery({
				runtime: manager,
				storeDB,
				client: () => httpRef.current,
				online: () => onlineRef.current,
				// The bridge's single run queue serialises recovery, replay and adoption finishing.
				due: () => current.reconnect(),
			}),
			disarm: () => {},
			watch: () => {},
		};
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
		let adoptionWatch: { unsubscribe: () => void } | undefined;
		// A finish that throws backs off on the ladder, per order: recording its failure writes the
		// journal, which must not itself run the next attempt (Codex 4344157679 on #2836).
		type Backoff = { failures: number; at: number; timer?: ReturnType<typeof setTimeout> };
		const adoptionBackoff = new Map<string, Backoff>();
		const disarm = () => {
			adoptionWatch?.unsubscribe();
			adoptionWatch = undefined;
			for (const backoff of adoptionBackoff.values()) {
				if (backoff.timer !== undefined) clearTimeout(backoff.timer);
				backoff.timer = undefined;
			}
		};
		current.disarm = disarm;
		/**
		 * A record refused on its re-send: one failed story (ADR 0040 Decided 1 rule 4), told as the
		 * tender tells it, and the attempt ends. Another refusal leaves the replay to judge the order.
		 */
		const raiseRefusal = async (uuid: string, refused: NonNullable<RecoveredOrder['refused']>) => {
			const codes: Record<string, PaymentRowRefusal | undefined> = PAYMENT_ROW_REFUSALS;
			const reason = codes[refused.code];
			if (!reason || !refused.row) return;
			const payload = (await findOrder(uuid))?.getLatest().payload;
			await raisePaymentRefusal(storeDB, tRef.current, {
				row: refused.row,
				order: refused.summary,
				reason,
				// The tender as the cashier saw it on the tile (ADR 0040 Decided 1 rule 4: the row names
				// what was taken); the id only for a method the store no longer lists.
				methodTitle: methodsRef.current.get(refused.row.method_id)?.title ?? refused.row.method_id,
				orderUuid: uuid,
				orderId: payload?.id ?? refused.row.order_id,
				orderNumber: payload?.number,
			});
			await resolveCompletionAttempt(storeDB, uuid);
		};
		/**
		 * The order has a command awaiting the store's answer: sent, or deferred offline. A
		 * never-sent crash leftover awaits nothing, so it holds neither an adopted sale nor its
		 * bounded abandonment; the online recovery drops it.
		 */
		const awaitsAnswer = async (uuid: string) =>
			(await readAwaitingAnswer(storeDB, uuid)).length > 0;
		/** The orders whose unanswered commands a re-send has now answered, with their answers. */
		const recover = async (): Promise<ReadonlyMap<string, ResentCommand[]>> => {
			if (current.stopped) return new Map();
			try {
				const recovered = await current.recovery.recover();
				for (const { orderUuid, refused } of recovered)
					if (refused) await raiseRefusal(orderUuid, refused).catch(() => undefined);
				return new Map(
					recovered
						.filter(({ answers }) => answers.length > 0)
						.map(({ orderUuid, answers }) => [orderUuid, answers])
				);
			} catch (error) {
				logger.debug('Could not re-send unanswered money commands', {
					context: { error: String(error) },
				});
				return new Map();
			}
		};
		/**
		 * A recovered gateway submit answered `sent` lands through the answer table (`landAnswer`,
		 * `{ via: 'recovery' }`) as a sent sale (its `checkout.sent` audit, the attempt resolved),
		 * from the stamp the refresh adopted with the store's document: never the unpaid replay,
		 * which would count starts and abandon it. A send is the only answer landed here: a recovered
		 * record, a settled or recorded submit, a close and a capture go to the resident judge
		 * (`replay`, `finishOne`), which decides on the attempt's stored status and the adopted
		 * document (an offline record's second completion is a replay: ADR 0040 Decided 1 rule 3).
		 * Returns the orders finished this way.
		 */
		const finishRecovered = async (answered: ReadonlyMap<string, ResentCommand[]>) => {
			const finished = new Set<string>();
			if (answered.size === 0) return finished;
			const pending = await pendingCompletions(storeDB);
			for (const [uuid, answers] of answered) {
				if (current.stopped) break;
				const attempt = pending[uuid];
				if (!attempt) continue;
				const resident = await findOrder(uuid);
				if (!resident) continue;
				const sent = answers
					.map((resent) => answerOf(resent, resident.getLatest().payload))
					.find((answer) => answer?.kind === 'sent');
				if (!sent) continue;
				try {
					await landAnswer(
						sent,
						{ via: 'recovery' },
						{
							finish: (outcome) =>
								completeSale({ ...current.ctx, actor: attempt.actor }, resident, outcome, {
									host: 'background',
								}),
							resolveAttempt: () => resolveCompletionAttempt(storeDB, uuid),
							dp: current.ctx.dp,
						}
					);
					finished.add(uuid);
				} catch (error) {
					logger.debug('Recovered sent sale not finished', {
						context: { orderUUID: uuid, error: String(error) },
					});
				}
			}
			return finished;
		};
		const replay = async (only?: ReadonlySet<string>, skip?: ReadonlySet<string>) => {
			const pending = await pendingCompletions(storeDB);
			for (const [uuid, attempt] of Object.entries(pending)) {
				if (current.stopped) return;
				if ((only && !only.has(uuid)) || skip?.has(uuid)) continue;
				try {
					// A record still journaled (an offline sale's) has no answer to judge: no unpaid start,
					// no abandon, until the recovery answers it (ADR 0040 Decided 1 rule 3).
					if (await awaitsAnswer(uuid)) continue;
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
					const replay = replayOf(attempt);
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
		// A recovered answer that reads paid but did not finish here (its refresh failed) is the same
		// state as an unconfirmed close: the pull that adopts the paid order finishes it (Codex
		// 4344157692 on #2836).
		const awaitAnswered = async (answered: ReadonlyMap<string, ResentCommand[]>) => {
			if (answered.size === 0) return;
			const pending = await pendingCompletions(storeDB);
			for (const [uuid, answers] of answered)
				if (pending[uuid] && answers.some(answerReadsPaid)) await awaitAdoption(storeDB, uuid);
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
			const answered = onlineRef.current ? await recover() : new Map<string, ResentCommand[]>();
			const sent = await finishRecovered(answered);
			if (!current.stopped) await replay(undefined, sent);
			if (!current.stopped) await awaitAnswered(answered);
		});
		current.reconnect = () =>
			run(async () => {
				if (current.stopped) return;
				const answered = await recover();
				const sent = await finishRecovered(answered);
				const rest = new Set([...answered.keys()].filter((uuid) => !sent.has(uuid)));
				if (rest.size > 0 && !current.stopped) await replay(rest);
				if (!current.stopped) await awaitAnswered(answered);
			});
		/**
		 * An `unconfirmed` sale (Codex 4341491589 on #2798): the store took it, no refresh agreed,
		 * and the tender left it to this bridge. Once a pull adopts the paid order it is finished
		 * here, the same session: receipt, completion audit, attempt resolved. Checked inside the
		 * order's mutation queue, so a finish that ran first (a retried close) is not repeated.
		 */
		const finishAdopted = (uuids: string[]) =>
			run(async () => {
				for (const uuid of uuids) {
					const backoff = adoptionBackoff.get(uuid);
					if (backoff && backoff.at > Date.now()) {
						armAdoption(uuid, backoff, backoff.at - Date.now());
						continue;
					}
					const resident = current.stopped ? null : await findOrder(uuid);
					if (!resident) continue;
					try {
						await finishOne(uuid, resident);
						adoptionBackoff.delete(uuid);
					} catch (error) {
						const failures = (backoff?.failures ?? 0) + 1;
						const step =
							RECOVERY_RETRY_DELAYS_MS[Math.min(failures - 1, RECOVERY_RETRY_DELAYS_MS.length - 1)];
						const next = { failures, at: Date.now() + step };
						adoptionBackoff.set(uuid, next);
						armAdoption(uuid, next, step);
						logger.debug('Adopted sale not finished', {
							context: { orderUUID: uuid, error: String(error) },
						});
					}
				}
			});
		const finishOne = (
			uuid: string,
			resident: NonNullable<Awaited<ReturnType<typeof findOrder>>>
		) =>
			enqueueOrderMutation(uuid, async (queue) => {
				const attempt = (await pendingCompletions(storeDB))[uuid];
				if (!attempt?.awaitingAdoption || current.stopped) return;
				// An offline sale's resident reads paid and, with no chain, `residentHoldsAnswer` holds:
				// only the journal says the store has not answered (ADR 0040 Decided 1 rule 3).
				if (await awaitsAnswer(uuid)) return;
				const outcome = replayOf(attempt);
				if (!isSaleComplete(outcome, current.ctx.dp, resident.getLatest().payload)) return;
				// Only a whole document adopted after the answer stands in for the replay's refresh;
				// until one arrives the attempt stays pending.
				if (!(await residentHoldsAnswer(manager, storeDB, uuid))) return;
				const ctx = { ...current.ctx, actor: attempt.actor };
				// An offline sale already had its paid moment at the till; this completion is a
				// REPLAY (ADR 0040 Decided 1 rule 3): audited `replayed: true`, receipt entered
				// unselected (`host: 'background'`), no drawer, no print, no haptic.
				const finish = { ...outcome, refreshed: true };
				await completeSale(ctx, resident, finish, { host: 'background' }, queue);
			});
		const armAdoption = (uuid: string, backoff: Backoff, delay: number) => {
			if (backoff.timer !== undefined || current.stopped) return;
			backoff.timer = setTimeout(
				() => {
					backoff.timer = undefined;
					backoff.at = 0;
					finishAdopted([uuid]);
				},
				Math.max(0, delay)
			);
		};
		const watchAdoptions = () => {
			adoptionWatch ??= observePendingCompletions(storeDB)
				.pipe(
					// Keyed on the eligible set: a journal write that changes only an attempt's count or
					// error keeps the resident subscription (and its initial emission) as it is.
					map((pending) =>
						Object.keys(pending)
							.filter((uuid) => pending[uuid].awaitingAdoption)
							.sort()
					),
					distinctUntilChanged((a, b) => a.join() === b.join()),
					switchMap((uuids) => observeResidentOrders(manager.engine, uuids))
				)
				.subscribe({
					next: (uuids) => uuids.length > 0 && finishAdopted(uuids),
					error: () => undefined,
				});
		};
		current.watch = watchAdoptions;
		current.recovery.resume();
		current.watch();
		return () => {
			current.stopped = true;
			current.recovery.suspend();
			disarm();
		};
	}, [storeDB, manager, ctx, version]);
	return null;
}
