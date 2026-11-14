import * as React from 'react';

import { filter, take } from 'rxjs';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { type EngineRecord } from '@wcpos/query';
import {
	observeOpenSessionPresence,
	RegisterSessionRequiredError,
} from '@wcpos/query/register-session';
import { type CategoryLogger, getErrorMessage } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { commitGatewaySale } from '../commit-gateway-sale';
import { presentTenderRefusal } from '../present-tender-refusal';
import { presentSessionRequired } from '../session-required';
import { SESSION_REQUIRED_REASON } from '../tender/tender-guards';
import { isActionRefusal } from '../../../../../extensions/actions';
import { useRegisterBinding } from '../../../../../services/register/use-register-binding';
import { useT } from '../../../../../contexts/translations';
import { pushFailureCode } from '../../../contexts/push-failure-code';

import type { SaleContext } from '../sale-completion';

interface PayPagePreparationInput {
	order: EngineRecord<'orders'>;
	ctx: SaleContext;
	rawPaymentURL: string | undefined;
	retryToken: number;
	/** Every gateway's stored status, read at commit time (the catalog can still be loading). */
	settledRef: React.RefObject<Record<string, string | null>>;
	logger: CategoryLogger;
}

/**
 * The pay page's preparation: the session and register gates and the gateway sale's commit,
 * dispatched before the URL is exposed. `paymentURL` stays undefined until `prepared` is
 * `ready` whenever preparation applies, and while a failed preparation stands (Retry, a
 * register switch and a reopened session prepare again).
 */
export function usePayPagePreparation(input: PayPagePreparationInput) {
	const { order, ctx, rawPaymentURL, retryToken, settledRef, logger: orderLogger } = input;
	const { sessionsOn } = ctx;
	const online = useOnlineStatus().status === 'online-website-available';
	const { status: bindingStatus, registerId } = useRegisterBinding();
	const [sessionRetry, setSessionRetry] = React.useState(0);
	const t = useT();
	const preparationKey = `${order.uuid}:${registerId}`;
	const [preparation, setPreparation] = React.useState<{
		key: string;
		status: 'ready' | 'failed';
		sessionRequired?: boolean;
		sessionId?: string | null;
	} | null>(null);
	// Sessions require preparation even offline: a stale probe may hide a reachable
	// pay page. Online also waits for provenance; failed preparation stays closed.
	const prepared = preparation?.key === preparationKey ? preparation.status : null;
	const paymentURL =
		((online || sessionsOn) && prepared !== 'ready') || prepared === 'failed'
			? undefined
			: rawPaymentURL;

	// Latest collaborators for the preparation effect, refreshed after every render so
	// the effect can key on order identity rather than on revisions our own write emits.
	const collaborators = React.useRef({ order, ctx, orderLogger, t });
	React.useEffect(() => {
		collaborators.current = { order, ctx, orderLogger, t };
	});
	// Mounting the external pay page can complete the sale: prepare before exposing
	// its URL, persisting attribution online. Key on order identity, not our writes.
	// Cleanup only suppresses an obsolete view's readiness update.
	React.useEffect(() => {
		if ((!online && !sessionsOn) || !rawPaymentURL) return;
		const { order: currentOrder, ctx, orderLogger, t } = collaborators.current;
		let active = true;
		void (async () => {
			try {
				// The pay page can complete the sale, so its tender commit is dispatched before the
				// URL is exposed: the gates decide, the handler journals and stamps the provenance.
				const paymentMethod = currentOrder.getLatest().payload.payment_method ?? null;
				const committed = await commitGatewaySale(ctx, {
					order: currentOrder,
					source: 'gateway-snapshot',
					methodId: paymentMethod,
					bindingStatus: bindingStatus === 'unknown' ? 'none' : bindingStatus,
					online,
					// The whole catalog, not the opened gateway's entry: the pay page can settle
					// through any POS gateway, and replay judges the gateway the order comes back
					// carrying. The method on the order here is the one the sale was OPENED with.
					settledOrderStatuses: settledRef.current,
				});
				if (!active) return;
				if (isActionRefusal(committed)) {
					const reason = presentTenderRefusal(ctx.actionCtx, committed, orderLogger, t);
					setPreparation({
						key: preparationKey,
						status: 'failed',
						sessionRequired: reason === SESSION_REQUIRED_REASON,
					});
					return;
				}
				setPreparation({ key: preparationKey, status: 'ready', sessionId: committed.sessionId });
			} catch (error) {
				if (!active) {
					// The cashier left before the commit settled; nothing else reports this push.
					orderLogger.debug('Pay-page preparation failed after the view closed', {
						context: { error: getErrorMessage(error) },
					});
					return;
				}
				setPreparation({
					key: preparationKey,
					status: 'failed',
					sessionRequired: error instanceof RegisterSessionRequiredError,
				});
				if (error instanceof RegisterSessionRequiredError) {
					presentSessionRequired(orderLogger, t);
					return;
				}
				orderLogger.error('Checkout failed', {
					// The provenance push reports nothing itself; a refused session keeps AUTH101.
					code: pushFailureCode(error, ERROR_CODES.CHECKOUT_FAILED_CART_SAFE),
					showToast: true,
					toast: { title: t('pos_cart.checkout_failed') },
					context: { error: getErrorMessage(error) },
				});
			}
		})();
		return () => {
			active = false;
		};
	}, [
		preparationKey,
		ctx.userDB,
		ctx.siteUuid,
		ctx.storeId,
		online,
		rawPaymentURL,
		retryToken,
		sessionRetry,
		bindingStatus,
		sessionsOn,
		settledRef,
	]);

	// Readiness follows the prepared row; only a session refusal observes reopening.
	React.useEffect(() => {
		if (preparation?.key !== preparationKey || !sessionsOn) return;
		const sessionId = preparation.status === 'ready' ? preparation.sessionId : null;
		if (!sessionId && !preparation.sessionRequired) return;
		const subscription = observeOpenSessionPresence(
			ctx.storeDB,
			sessionId ? { sessionId } : { registerId: registerId ?? '' }
		)
			.pipe(
				filter((present) => present !== null && (sessionId ? !present : present)),
				take(1)
			)
			.subscribe(() => {
				if (!sessionId) return setSessionRetry((value) => value + 1);
				setPreparation({ key: preparationKey, status: 'failed', sessionRequired: true });
				const { orderLogger, t } = collaborators.current;
				presentSessionRequired(orderLogger, t);
			});
		return () => subscription?.unsubscribe();
	}, [ctx.storeDB, registerId, preparationKey, preparation, sessionsOn]);

	return { prepared, paymentURL };
}
