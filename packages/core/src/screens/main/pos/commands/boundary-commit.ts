import {
	type CartConfig,
	type CouponContext,
	hasLiveSettlementLeg,
	serverOwnsMoney,
	settleAggregate,
	settleCart,
	settlementPatch,
	snapshotFromOrderJSON,
	toMinor,
} from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import { type EngineRecord, observeCatalogChanges, readCatalogGeneration } from '@wcpos/query';
import { findOpenSession, RegisterSessionRequiredError } from '@wcpos/query/register-session';
import { resolveCompletionAttempt } from '@wcpos/query/store-local';

import { CHOOSE_REGISTER_REASON } from '../checkout/tender/tender-guards';
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
import {
	type BoundaryResult,
	crossesPaidBalanceBoundary,
	netPaidForBoundary,
} from './paid-balance-boundary';
import { writeZeroBalanceCompletion } from './zero-balance-completion';

import type { useCloseSale } from './close-sale';
import type { OrderPayload } from './cart-config-for-order';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';

const logger = getLogger(['wcpos', 'pos', 'settlement']);
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
		result: BoundaryResult;
		queue: OrderMutationContext;
	}
) {
	const catalog = observeCatalogChanges(ctx.runtime.engine).subscribe();
	const outcome = await commitSale(
		ctx,
		{
			order,
			methodId: null,
			bindingStatus: ctx.bindingStatus,
			amounts: { kind: 'retained-captures' },
		},
		async ({ registerId, sessionId, completing }, slot) => {
			await recordSaleAttempt(ctx, { order, source: 'zero-balance', completing });
			let conditionReason: string | undefined;
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
				complete: (target, slotQueue, summary) =>
					landAnswer(
						{ kind: 'close', order: summary },
						{ via: 'boundary' },
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
					if (hasLiveSettlementLeg(payload.meta_data)) return null;
					if (allowed && !allowed(payload)) {
						if (!allowed(payload, true)) return null;
						aggregateOnly = true;
					}
					if (serverOwnsMoney(payload.meta_data) || ctx.serverOwnsMoney(order.uuid)) return null;
					const config = ctx.configForOrder(payload);
					const snapshot = snapshotFromOrderJSON(payload);
					const fresh = coupons
						? settleCart(snapshot, config, { coupons })
						: settleAggregate(snapshot, config);
					if (
						'error' in fresh ||
						!crossesPaidBalanceBoundary({ payload, result: fresh, dp: config.dp })
					)
						return null;
					const patch = settlementPatch(fresh);
					const netPaid = netPaidForBoundary(payload, config.dp);
					if (toMinor(patch.total, config.dp) < toMinor(netPaid, config.dp))
						overpaid = { orderId: order.uuid, total: patch.total, netPaid };
					if (aggregateOnly) conditionReason = 'in_checkout';
					return patch;
				},
			});
			// A system pass that cannot close (offline, refused) leaves the order pos-partial; the
			// coordinator retries an offline one when the till reconnects.
			if (completion && typeof completion === 'object' && 'kind' in completion) {
				logger.debug('settlement.boundary-not-closed', {
					context: { orderId: order.uuid, outcome: completion.kind },
				});
				return completion;
			}
			// An answered close returns nothing (it landed in complete above): a truthy non-kind result
			// is only a supersession.
			if (completion) {
				await resolveCompletionAttempt(ctx.storeDB, order.uuid);
				logger.warn('settlement.boundary-superseded', {
					context: { orderId: order.uuid, ...(conditionReason && { reason: conditionReason }) },
				});
			} else if (overpaid) logger.warn('settlement.boundary-overpaid', { context: overpaid });
			return (
				refusal ??
				(completion && conditionReason
					? { superseded: true as const, reason: conditionReason }
					: completion)
			);
		},
		{ queue, source: ctx.source }
	).finally(() => catalog.unsubscribe());
	if (isActionRefusal(outcome))
		logger.warn('settlement.boundary-deferred', {
			context: { orderId: order.uuid, reason: outcome.deny.reasonKey },
		});
	return outcome;
}
