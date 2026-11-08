import {
	type CartConfig,
	type CouponContext,
	hasLiveSettlementLeg,
	toMinor,
} from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import { type EngineRecord, observeCatalogChanges, readCatalogGeneration } from '@wcpos/query';
import { findOpenSession, RegisterSessionRequiredError } from '@wcpos/query/register-session';
import { resolveCompletionAttempt } from '@wcpos/query/store-local';

import { CHOOSE_REGISTER_REASON, SESSION_REQUIRED_REASON } from '../checkout/tender/tender-guards';
import { conditionRules } from '../conditions/evaluate';
import { countConditionsInSlot } from '../conditions/snapshot';
import {
	type ActionRefusal,
	isActionRefusal,
	TENDER_COMMIT_EVENT,
} from '../../../../extensions/actions';
import { commitSale, type SaleCommitRequest } from '../checkout/commit-sale';
import {
	type CompletionResult,
	recordSaleAttempt,
	type SaleContext,
	type SaleOutcome,
} from '../checkout/sale-completion';
import { landAnswer } from './land-answer';
import { settlePayload } from './settle-payload';
import { writeZeroBalanceCompletion } from './zero-balance-completion';

import type { CloseOutcome, useCloseSale } from './close-sale';
import type { UnmetCondition } from '../conditions/evaluate';
import type { OrderPayload } from './cart-config-for-order';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';

const logger = getLogger(['wcpos', 'pos', 'settlement']);

/**
 * Every reason a boundary pass stops short, with its one retry decision. `true`: a later input (a
 * catalog write, a register or session change, the till leaving checkout) can clear it, so the
 * coordinator settles again when one arrives; a shortage that persists waits, it never spins.
 * `false`: the cashier must act (choose or open a register) before a pass can close.
 */
const RETRY_ON_NEW_INPUTS = {
	catalog_changed: true,
	register_changed: true,
	session_changed: true,
	in_checkout: true,
	'pos_cart.only_n_available': true,
	'pos_products.out_of_stock': true,
	[CHOOSE_REGISTER_REASON]: false,
	[SESSION_REQUIRED_REASON]: false,
} as const satisfies Record<UnmetCondition['reasonKey'], boolean> & Record<string, boolean>;
export type BoundaryReason = keyof typeof RETRY_ON_NEW_INPUTS;
// A refusal's key is any registrant's string; one this table does not name is never retried.
export const retryable = (reason: string): boolean =>
	RETRY_ON_NEW_INPUTS[reason as BoundaryReason] === true;

/** What a boundary pass did; `commitAtBoundary` alone builds it. */
export type BoundaryOutcome =
	| { kind: 'closed' }
	| { kind: 'superseded'; reason?: BoundaryReason; retry: boolean }
	| { kind: 'refused'; refusal: ActionRefusal; retry: boolean }
	| { kind: 'offline' }
	/** The store answered without closing: money still moving, an attempt unanswered, a refusal. */
	| { kind: 'unclosed'; close: Exclude<CloseOutcome, { kind: 'answered' | 'offline' }> };

export async function commitAtBoundary(
	ctx: SaleContext & {
		bindingStatus: SaleCommitRequest['bindingStatus'];
		readBindingStatus?: () => SaleCommitRequest['bindingStatus'];
		readRegisterId?: () => string | null;
		source?: 'user' | 'system';
		configForOrder: (payload: OrderPayload) => CartConfig;
		serverOwnsMoney: (uuid: string) => boolean;
		/** The completion; it receives the answer table's outcome (`landAnswer`), never builds one. */
		complete: (
			order: EngineRecord<'orders'>,
			outcome: SaleOutcome,
			queue: OrderMutationContext
		) => Promise<CompletionResult>;
		closeSale: ReturnType<typeof useCloseSale>;
	},
	{
		order,
		coupons,
		allowed,
		queue,
		write,
	}: {
		write: Parameters<typeof writeZeroBalanceCompletion>[1]['write'];
		coupons?: CouponContext;
		allowed?: (payload: OrderPayload, ignoreCheckout?: boolean) => boolean;
		order: EngineRecord<'orders'>;
		queue: OrderMutationContext;
	}
): Promise<BoundaryOutcome> {
	const catalog = observeCatalogChanges(ctx.runtime.engine).subscribe();
	const outcome = await commitSale(
		ctx,
		{
			order,
			methodId: null,
			bindingStatus: ctx.bindingStatus,
			amounts: { kind: 'retained-captures' },
		},
		async (
			{ registerId, sessionId, completing },
			slot
		): Promise<BoundaryOutcome | ActionRefusal> => {
			await recordSaleAttempt(ctx, { order, source: 'zero-balance', completing });
			let conditionReason: BoundaryReason | undefined;
			let session: Awaited<ReturnType<typeof findOpenSession>> | undefined;
			let validatedGeneration: number | undefined;
			// Once checkout takes over, this pass cannot resume completion without provenance.
			let aggregateOnly = false;
			const revalidate = async () => {
				try {
					session = await findOpenSession(ctx.storeDB, registerId, ctx.sessionsOn);
				} catch (error) {
					if (error instanceof RegisterSessionRequiredError)
						return (conditionReason = 'session_changed');
					throw error;
				}
				// A snapshot is valid only if the catalog stayed still throughout its read.
				for (let attempt = 0; attempt < 2; attempt++) {
					validatedGeneration = readCatalogGeneration(ctx.runtime.engine);
					const [unmet] = await countConditionsInSlot(
						slot.order ?? order,
						ctx.actionCtx,
						conditionRules(ctx.actionCtx.store.preventOverselling)
					);
					if (validatedGeneration === readCatalogGeneration(ctx.runtime.engine))
						return (conditionReason = unmet?.reasonKey);
				}
				return (conditionReason = 'catalog_changed');
			};
			let refusal: ActionRefusal | undefined;
			let overpaid: { orderId: string; total: string; netPaid: number } | undefined;
			const completion = await writeZeroBalanceCompletion(ctx, {
				order,
				sessionId,
				write,
				revalidate,
				aggregateOnly: () => aggregateOnly,
				queue: slot,
				complete: (target, slotQueue, { order: summary }) =>
					landAnswer(
						{ kind: 'close', order: summary },
						{
							finish: (outcome) => ctx.complete(target, outcome, slotQueue),
							// A close never calls it; only a `reopened` answer does.
							resolveAttempt: () => resolveCompletionAttempt(ctx.storeDB, target.uuid),
							dp: ctx.dp,
						}
					),
				online: ctx.closeSale.online,
				close: (target) => ctx.closeSale.close(target, { sessionId }),
				changes: (payload) => {
					overpaid = undefined;
					if (
						validatedGeneration !== undefined &&
						validatedGeneration !== readCatalogGeneration(ctx.runtime.engine)
					) {
						conditionReason = 'catalog_changed';
						return null;
					}
					if (ctx.readBindingStatus?.() === 'choose') {
						refusal = {
							deny: { reasonKey: CHOOSE_REGISTER_REASON, detail: { event: TENDER_COMMIT_EVENT } },
						};
						return null;
					}
					if (ctx.readRegisterId && ctx.readRegisterId() !== registerId) {
						conditionReason = 'register_changed';
						return null;
					}
					// The guard's session document stays live across awaits and resident resolution.
					const liveSession = session?.getLatest();
					if (
						session !== undefined &&
						ctx.sessionsOn &&
						(!liveSession ||
							liveSession.deleted ||
							liveSession.id !== sessionId ||
							liveSession.register_id !== registerId ||
							liveSession.status !== 'open' ||
							liveSession.sync_status === 'failed')
					) {
						conditionReason = 'session_changed';
						return null;
					}
					// Before `allowed`: a live leg never marks the pass aggregate-only.
					if (hasLiveSettlementLeg(payload.meta_data)) return null;
					if (allowed && !allowed(payload)) {
						if (!allowed(payload, true)) return null;
						aggregateOnly = true;
					}
					const config = ctx.configForOrder(payload);
					const fresh = settlePayload({
						payload,
						config,
						coupons,
						owner: { uuid: order.uuid, serverOwnsMoney: ctx.serverOwnsMoney },
					});
					if (fresh.kind !== 'boundary') return null;
					const { changes, netPaid } = fresh;
					if (toMinor(changes.total, config.dp) < toMinor(netPaid, config.dp))
						overpaid = { orderId: order.uuid, total: changes.total, netPaid };
					if (aggregateOnly) conditionReason = 'in_checkout';
					return changes;
				},
			});
			// A system pass that cannot close (offline, refused) leaves the order pos-partial; the
			// coordinator retries an offline one when the till reconnects.
			if (completion.kind !== 'closed' && completion.kind !== 'superseded') {
				logger.debug('settlement.boundary-not-closed', {
					context: { orderId: order.uuid, outcome: completion.kind },
				});
				return completion.kind === 'offline' ? completion : { kind: 'unclosed', close: completion };
			}
			// An answered close landed in complete above.
			if (completion.kind === 'superseded') {
				await resolveCompletionAttempt(ctx.storeDB, order.uuid);
				logger.warn('settlement.boundary-superseded', {
					context: { orderId: order.uuid, ...(conditionReason && { reason: conditionReason }) },
				});
			} else if (overpaid) logger.warn('settlement.boundary-overpaid', { context: overpaid });
			if (refusal) return refusal;
			if (completion.kind === 'closed') return completion;
			return conditionReason
				? { kind: 'superseded', reason: conditionReason, retry: retryable(conditionReason) }
				: { kind: 'superseded', retry: false };
		},
		{ queue, source: ctx.source }
	).finally(() => catalog.unsubscribe());
	if (!isActionRefusal(outcome)) return outcome;
	logger.warn('settlement.boundary-deferred', {
		context: { orderId: order.uuid, reason: outcome.deny.reasonKey },
	});
	return { kind: 'refused', refusal: outcome, retry: retryable(outcome.deny.reasonKey) };
}
