import * as React from 'react';

import { switchMap } from 'rxjs/operators';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { type OrderPaymentSummary, readAwaitingCustomer } from '@wcpos/order-math';
import {
	observeResidentOrders,
	recoverMoneyCommands,
	RECOVERY_RETRY_DELAYS_MS,
	type ResentCommand,
	useQueryRuntime,
} from '@wcpos/query';
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
	claimHeld,
	failCompletionAttempt,
	nextClaimExpiry,
	observeMoneyJournal,
	observePendingCompletions,
	pendingCompletions,
	resolveCompletionAttempt,
} from '@wcpos/query/store-local';

import { useStoreSession } from '../../../../contexts/app-state';
import { enqueueOrderMutation } from '../hooks/order-mutation-queue';
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
		/** Schedule the claim-lapse and ladder re-runs; `disarm` cancels them. */
		arm: () => void;
		disarm: () => void;
		/** Watch the journal for commands left unanswered (see `observeMoneyJournal`). */
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
			// React re-runs effects on remount and HMR; the watch and timers are re-armed so no
			// interval goes unwatched.
			previous.watch();
			if (onlineRef.current) previous.arm();
			return () => {
				previous.stopped = true;
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
			arm: () => {},
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
		// A command the recovery skipped because a live claim held it is tried again when that claim
		// lapses (a crashed process's claim survives it), not only at the next start or reconnect.
		let lapse: ReturnType<typeof setTimeout> | undefined;
		// The backoff re-run after an unanswered re-send (`RECOVERY_RETRY_DELAYS_MS`).
		let retry: ReturnType<typeof setTimeout> | undefined;
		// The armed step's deadline, kept across an effect re-run's disarm; `retries` counts the
		// re-runs that executed, so scheduling twice never advances the ladder (Codex 4344063834
		// on #2836).
		let retryAt: number | null = null;
		let retries = 0;
		let retryPending = false;
		// Declared here so `disarm` can end it; `watch` (below) starts it.
		let journalWatch: { unsubscribe: () => void } | undefined;
		let adoptionWatch: { unsubscribe: () => void } | undefined;
		const disarm = () => {
			if (lapse !== undefined) clearTimeout(lapse);
			lapse = undefined;
			if (retry !== undefined) clearTimeout(retry);
			retry = undefined;
			journalWatch?.unsubscribe();
			journalWatch = undefined;
			adoptionWatch?.unsubscribe();
			adoptionWatch = undefined;
		};
		const armRetry = () => {
			if (retry !== undefined || !retryPending || current.stopped) return;
			const now = Date.now();
			retryAt ??=
				now + RECOVERY_RETRY_DELAYS_MS[Math.min(retries, RECOVERY_RETRY_DELAYS_MS.length - 1)];
			retry = setTimeout(
				() => {
					retry = undefined;
					retryAt = null;
					// Offline nothing can be sent; the reconnect hook re-runs recovery (Codex 4333265115
					// on #2798).
					if (!onlineRef.current) return;
					retries += 1;
					current.reconnect();
				},
				Math.max(0, retryAt - now)
			);
		};
		const recoverWhenClaimsLapse = async () => {
			const scope = manager.engine?.active()?.scopeId ?? null;
			const expiry = await nextClaimExpiry(storeDB, scope).catch(() => null);
			if (lapse !== undefined) clearTimeout(lapse);
			lapse = undefined;
			if (expiry === null || current.stopped) return;
			lapse = setTimeout(() => current.reconnect(), Math.max(0, expiry - Date.now()) + 1);
		};
		current.disarm = disarm;
		current.arm = () => {
			void recoverWhenClaimsLapse();
			armRetry();
		};
		/** The orders whose unanswered commands a re-send has now answered, with their answers. */
		const recover = async (): Promise<ReadonlyMap<string, ResentCommand[]>> => {
			if (current.stopped) return new Map();
			// Bound to this session (Codex 4344063828 on #2836): a store or site switch swaps the
			// client, and an old journal's command must not go out through the new store. Refused
			// once the session stops, a send stays journaled for its own session's recovery.
			const client = httpRef.current;
			try {
				const recovered = await recoverMoneyCommands(manager, storeDB, {
					post: (url, body) =>
						current.stopped
							? Promise.reject(new Error('money_command_session_stopped'))
							: client.post(url, body),
				});
				await recoverWhenClaimsLapse();
				retryPending = recovered.some(({ unanswered }) => unanswered);
				if (!retryPending) {
					retries = 0;
					retryAt = null;
					if (retry !== undefined) clearTimeout(retry);
					retry = undefined;
				}
				armRetry();
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
		 * A recovered gateway submit answered `sent` finishes as a sent sale (its `checkout.sent`
		 * audit, the attempt resolved), from the stamp the refresh adopted with the store's
		 * document: never the unpaid replay, which would count starts and abandon it. Returns the
		 * orders finished this way; the rest go through the completion replay.
		 */
		const finishRecovered = async (answered: ReadonlyMap<string, ResentCommand[]>) => {
			const finished = new Set<string>();
			if (answered.size === 0) return finished;
			const pending = await pendingCompletions(storeDB);
			for (const [uuid, answers] of answered) {
				if (current.stopped) break;
				const sent = answers.find(({ kind, data }) => kind === 'submit' && data.outcome === 'sent');
				const attempt = pending[uuid];
				const summary = sent?.data.order as OrderPaymentSummary | undefined;
				// A `sent` gateway answer is final only when the summary carries a status; a summary
				// without one is the trimmed ack and the next refresh decides (ADR 0040 §1.8).
				if (!sent || !attempt || typeof summary?.status !== 'string') continue;
				const resident = await findOrder(uuid);
				const stamp = resident
					? readAwaitingCustomer(resident.getLatest().payload.meta_data)
					: null;
				if (!resident || !stamp) continue;
				try {
					await completeSale(
						{ ...current.ctx, actor: attempt.actor },
						resident,
						{ source: 'gateway', order: summary, stamp },
						{ host: 'background' }
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
		});
		current.reconnect = () =>
			run(async () => {
				if (current.stopped) return;
				const answered = await recover();
				const sent = await finishRecovered(answered);
				const rest = new Set([...answered.keys()].filter((uuid) => !sent.has(uuid)));
				if (rest.size > 0 && !current.stopped) await replay(rest);
			});
		// A command whose answers are lost after this session's first recovery, while the till
		// stays online: no reconnect will come for it, and a pull may close its tender. Watching
		// the journal schedules its recovery: a sent command nobody holds arms the first backoff
		// step, a live claim its lapse. Another scope's command waits for that scope.
		const watch = () => {
			journalWatch ??= observeMoneyJournal(storeDB).subscribe({
				next: (entries) => {
					if (current.stopped) return;
					const scope = manager.engine?.active()?.scopeId ?? null;
					const unanswered = entries.some(
						(entry) => entry.sentAt !== null && entry.scope === scope && !claimHeld(entry, null)
					);
					if (unanswered && retry === undefined) {
						retryPending = true;
						armRetry();
					}
					void recoverWhenClaimsLapse();
				},
				error: () => undefined,
			});
		};
		/**
		 * An `unconfirmed` sale (Codex 4341491589 on #2798): the store took it, no refresh agreed,
		 * and the tender left it to this bridge. Once a pull adopts the paid order it is finished
		 * here, the same session: receipt, completion audit, attempt resolved. Checked inside the
		 * order's mutation queue, so a finish that ran first (a retried close) is not repeated.
		 */
		const finishAdopted = (uuids: string[]) =>
			run(async () => {
				for (const uuid of uuids) {
					const resident = current.stopped ? null : await findOrder(uuid);
					if (!resident) continue;
					await enqueueOrderMutation(uuid, async (queue) => {
						const attempt = (await pendingCompletions(storeDB))[uuid];
						if (!attempt?.awaitingAdoption || current.stopped) return;
						const outcome = replayOf(attempt);
						if (!isSaleComplete(outcome, current.ctx.dp, resident.getLatest().payload)) return;
						// The adopted document is the store's copy: no second refresh before the receipt.
						const ctx = { ...current.ctx, actor: attempt.actor };
						const finish = { ...outcome, refreshed: true };
						await completeSale(ctx, resident, finish, { host: 'background' }, queue);
					});
				}
			});
		const watchAdoptions = () => {
			adoptionWatch ??= observePendingCompletions(storeDB)
				.pipe(
					switchMap((pending) =>
						observeResidentOrders(
							manager.engine,
							Object.keys(pending).filter((uuid) => pending[uuid].awaitingAdoption)
						)
					)
				)
				.subscribe({
					next: (uuids) => uuids.length > 0 && finishAdopted(uuids),
					error: () => undefined,
				});
		};
		current.watch = () => {
			watch();
			watchAdoptions();
		};
		current.watch();
		return () => {
			current.stopped = true;
			disarm();
		};
	}, [storeDB, manager, ctx, version]);
	return null;
}
