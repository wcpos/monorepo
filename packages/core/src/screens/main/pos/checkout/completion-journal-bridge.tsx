import * as React from 'react';

import { type EngineRecord, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useStoreSession } from '../../../../contexts/app-state';
import { findEngineResident } from '../../hooks/mutations/use-local-mutation';
import {
	failCompletionAttempt,
	pendingCompletions,
	resolveCompletionAttempt,
} from './completion-journal';
import { useSaleContext } from './hooks/use-sale-context';
import { completeSale, isSaleComplete, refreshOrderRecord } from './sale-completion';

const logger = getLogger(['wcpos', 'pos', 'checkout']);

/** Replays outstanding finishes at store-session start, never collecting or pushing money. */
export function SaleCompletionBridge(): null {
	const { storeDB } = useStoreSession();
	const manager = useQueryRuntime();
	const ctx = useSaleContext();
	const session = React.useRef<{
		storeDB: typeof storeDB;
		manager: typeof manager;
		ctx: typeof ctx;
		stopped: boolean;
	} | null>(null);

	// The journal belongs to the external store session, not a checkout screen.
	React.useEffect(() => {
		const previous = session.current;
		if (previous?.storeDB === storeDB && previous.manager === manager) {
			// Context changes and StrictMode reconnect the same run, never start another.
			previous.ctx = ctx;
			previous.stopped = false;
			return () => {
				previous.stopped = true;
			};
		}
		const current = { storeDB, manager, ctx, stopped: false };
		session.current = current;
		const replay = async () => {
			const pending = await pendingCompletions(storeDB);
			for (const [uuid, attempt] of Object.entries(pending)) {
				if (current.stopped) return;
				try {
					const resident = (await findEngineResident(
						manager,
						'orders',
						uuid
					)) as unknown as EngineRecord<'orders'> | null;
					if (current.stopped) return;
					if (!resident) {
						await failCompletionAttempt(storeDB, uuid, 'order_not_resident', true);
						if (current.stopped) return;
						if ((attempt.missingStarts ?? 0) + 1 >= 3) {
							await resolveCompletionAttempt(storeDB, uuid);
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
					if (!isSaleComplete({ source: 'replay' }, current.ctx.dp, payload) && payload.id) {
						// One bounded targeted GET per pending unpaid order at start; no second GET in the owner.
						try {
							if ((await refreshOrderRecord(manager, payload.id)) === 'timed-out')
								throw new Error('completion_refresh_timed_out');
							refreshed = true;
						} catch (error) {
							await failCompletionAttempt(storeDB, uuid, error);
							continue;
						}
						if (current.stopped) return;
					}
					if (!isSaleComplete({ source: 'replay' }, current.ctx.dp, resident.getLatest().payload)) {
						await resolveCompletionAttempt(storeDB, uuid);
						logger.debug('Sale completion replay skipped: order is not completing', {
							context: { orderUUID: uuid },
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
	}, [storeDB, manager, ctx]);
	return null;
}
