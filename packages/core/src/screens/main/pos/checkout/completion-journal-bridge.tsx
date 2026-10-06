import * as React from 'react';

import { type EngineRecord, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { DRAINABLE_SCOPE_DATABASE_GENERATION, scopeDatabaseName } from '@wcpos/sync-core';
import {
	awaitLegacyUnsentReport,
	legacyUnsentOrderUuids,
	legacyUnsentReportUncountable,
} from '@wcpos/utils/unsent-changes';

import { useStoreSession } from '../../../../contexts/app-state';
import {
	getTerminalPaymentsServiceStartVersion,
	subscribeTerminalPaymentsServiceStart,
} from '../../../../services/terminal-payments';
import { findEngineResident } from '../../hooks/mutations/use-local-mutation';
import {
	failCompletionAttempt,
	pendingCompletions,
	resolveCompletionAttempt,
} from './completion-journal';
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

/** Replays outstanding finishes at store-session start, never collecting or pushing money. */
export function SaleCompletionBridge(): null {
	const { storeDB } = useStoreSession();
	const manager = useQueryRuntime();
	const ctx = useSaleContext();
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
	} | null>(null);

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
		const current = { storeDB, manager, ctx, startVersion, stopped: false };
		session.current = current;
		/**
		 * The ACTIVE scope's previous-generation database — the only report this replay waits on.
		 * Resolved by waiting for the engine's active scope, not by reading it once: on a cold boot
		 * the bridge mounts before the engine's open completes, and deciding "no legacy database"
		 * then would count a missed start before the drain could carry the order over. Bounded
		 * like the report wait; an engine with no scope to give (logged out, disposed) has none.
		 */
		const activeLegacyDatabase = async (): Promise<string | null> => {
			const engine = manager.engine;
			if (!engine) return null;
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				const active =
					engine.active() ??
					(await Promise.race([
						engine.whenActive(),
						new Promise<null>((resolve) => {
							timer = setTimeout(() => resolve(null), LEGACY_DRAIN_REPORT_WAIT_MS);
						}),
					]));
				return active
					? scopeDatabaseName(active.identity, { generation: DRAINABLE_SCOPE_DATABASE_GENERATION })
					: null;
			} catch {
				return null;
			} finally {
				if (timer !== undefined) clearTimeout(timer);
			}
		};
		// Awaited once per replay, and only when an order is missing: a resident order never waits.
		let legacyReport: Promise<string | null> | null = null;
		const legacyDrainReported = () =>
			(legacyReport ??= (async () => {
				const legacyDatabase = await activeLegacyDatabase();
				if (legacyDatabase === null || current.stopped) return legacyDatabase;
				const result = await awaitLegacyUnsentReport(legacyDatabase, LEGACY_DRAIN_REPORT_WAIT_MS);
				if (result === 'timed-out') {
					logger.warn('Replaying sale completions without the previous database version report', {
						context: { waitedMs: LEGACY_DRAIN_REPORT_WAIT_MS },
					});
				}
				return legacyDatabase;
			})());
		const findOrder = async (uuid: string) =>
			(await findEngineResident(
				manager,
				'orders',
				uuid
			)) as unknown as EngineRecord<'orders'> | null;
		const replay = async () => {
			const pending = await pendingCompletions(storeDB);
			for (const [uuid, attempt] of Object.entries(pending)) {
				if (current.stopped) return;
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
						// scope's one could not be counted at all (it failed to open), so it MAY: either way
						// the order is not resident YET, which is not a missed start, and abandoning it would
						// drop a captured payment's completion. A later start with a countable report counts.
						const legacyDatabase = await legacyDrainReported();
						if (current.stopped) return;
						const keptInLegacyDatabase =
							legacyUnsentOrderUuids().has(uuid) ||
							(legacyDatabase !== null && legacyUnsentReportUncountable(legacyDatabase));
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
					if (
						payload.status !== 'cancelled' &&
						!isSaleComplete({ source: 'replay' }, current.ctx.dp, payload) &&
						payload.id
					) {
						// One bounded targeted GET per pending unpaid order at start; no second GET in the owner.
						try {
							if ((await refreshOrderRecord(manager, payload.id)) === 'timed-out')
								throw new Error('completion_refresh_timed_out');
							refreshed = true;
						} catch (error) {
							await failCompletionAttempt(storeDB, uuid, error, { expectAt: attempt.at });
							continue;
						}
						if (current.stopped) return;
					}
					if (!isSaleComplete({ source: 'replay' }, current.ctx.dp, resident.getLatest().payload)) {
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
							{ source: 'replay', ...(refreshed ? { refreshed } : {}) },
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
		void replay().catch((error: unknown) => {
			logger.debug('Could not read pending sale completions', {
				context: { error: String(error) },
			});
		});
		return () => {
			current.stopped = true;
		};
	}, [storeDB, manager, ctx, version]);
	return null;
}
