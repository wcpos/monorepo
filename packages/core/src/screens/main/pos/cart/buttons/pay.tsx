import * as React from 'react';

import { useRouter } from 'expo-router';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@wcpos/components/button';
import { CROSSFADE } from '@wcpos/components/lib/motion';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { getNetPaymentTotal } from '@wcpos/order-math';
import { useRecordField } from '@wcpos/query';

import { useTheme } from '../../../../../contexts/theme';
import { useRegisterSurface } from '../../../../../extensions/commands/use-register-surface';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';
import {
	clearOrderSaving,
	enterCheckout,
	getOrderSaveState,
	leaveCheckout,
	markOrderSaving,
} from '../../checkout/checkout-mode';
import { useT } from '../../../../../contexts/translations';
import { scrollToLine, useCartUnmet } from '../../conditions/use-cart-conditions';
import { reportPushFailure } from '../../../contexts/push-failure-code';
import { usePushDocument } from '../../../contexts/use-push-document';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { useCurrentOrder } from '../../contexts/current-order';
import { type CheckoutRejection, useCheckoutSave } from '../../checkout/hooks/use-checkout-save';
import { showOrderRefusedToast } from '../../checkout/refusal-toast';
import { orderChangedSinceRefusal } from '../../checkout/refused-wire';
import { returnToTill } from '../../checkout/till-route';

const checkoutLogger = getLogger(['wcpos', 'pos', 'checkout']);
const BLOCKED_OPACITY = 0.38; // the dimmed Pay of the checkout-conditions board (roadmap#62)

/**
 *
 */
export function PayButton() {
	const { currentOrderRecord } = useCurrentOrder();
	const total = useRecordField(currentOrderRecord, (order) => order.payload.total);
	const refunds = useRecordField(currentOrderRecord, (order) => order.payload.refunds);
	const lineItems = useRecordField(currentOrderRecord, (order) => order.payload.line_items);
	const { format } = useCurrentOrderCurrencyFormat();
	const router = useRouter();
	const { screenSize } = useTheme();
	const { loaded, unsupportedSchema } = usePaymentMethods();
	const [loading, setLoading] = React.useState(false);
	const pushDocument = usePushDocument();
	const save = useCheckoutSave();
	const t = useT();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();
	const unmet = useCartUnmet();
	const reduced = useReducedMotion();

	const displayTotal = getNetPaymentTotal(total, refunds);

	/**
	 *
	 */
	const handlePay = React.useCallback(async () => {
		if (unmet.length > 0) {
			scrollToLine(unmet[0].lineUuid);
			return checkoutLogger.info(t('pos_cart.checkout_blocked', { n: unmet.length }), {
				context: { orderId: currentOrderRecord.uuid, unmet: unmet.map((u) => [u.id, u.lineUuid]) },
			});
		}
		// #163 ruling R5: a dead storage worker hard-blocks the money paths. Cash
		// taken for an order the device cannot persist has no local record at all.
		if (blockIfDegraded('checkout', { orderId: currentOrderRecord.uuid })) {
			return;
		}

		const uuid = currentOrderRecord.uuid;
		const orderLogger = checkoutLogger.with({
			orderId: uuid,
			orderNumber: currentOrderRecord.payload.number,
		});
		const showRefusal = (rejection: CheckoutRejection) => {
			showOrderRefusedToast({ t, router, rejection });
			orderLogger.error('Checkout refused', {
				code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
				context: { ...rejection },
			});
		};
		const sheetRoute = {
			pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
			params: { orderId: uuid },
		} as const;
		// Optimistic only where the tender flow hosts the checkout: it reads the saving
		// flag and keeps every tile inert until the server copy (and its id) exists. The
		// legacy webview checkout has no such gate, so that lane still waits for the save.
		const tenderFlow = loaded && !unsupportedSchema;
		const state = getOrderSaveState(uuid);
		// Pay never resends the save the store just refused; a cart changed since is a new
		// save, and its accepted write settles the dead letter in the drain (#2946). A parked
		// record (conflict) blocks every later write until it is resolved, so it is never retried.
		const retry = state?.kind === 'rejected';
		if (retry) {
			if (state.parked || !orderChangedSinceRefusal(currentOrderRecord.payload, state.refused)) {
				showRefusal(state);
				return;
			}
			orderLogger.info('Checkout retries a refused save', {
				context: { orderId: uuid, refusedStatus: state.status, refusedReason: state.reason },
			});
		}
		if (state?.kind === 'saving') {
			// The earlier press is still waiting on the store. Show that wait again
			// rather than enqueue a second write; the pane flips on the same events.
			if (tenderFlow) enterCheckout(uuid);
			if (tenderFlow && screenSize === 'sm') router.push(sheetRoute);
			return;
		}
		markOrderSaving(uuid, { retry });
		// Every width enters checkout: the phone's sheet is a checkout member too, so a paid
		// sale stays the current order while its sheet is up (the provider holds members only).
		if (tenderFlow) {
			enterCheckout(uuid);
			if (screenSize === 'sm') router.push(sheetRoute);
		} else {
			setLoading(true);
		}
		// A save that fails or is blocked puts the cashier back at the cart to retry.
		const abandon = () => {
			leaveCheckout(uuid);
			if (tenderFlow && screenSize === 'sm') returnToTill(router, true, 'cart');
		};

		try {
			const result = tenderFlow
				? await save(currentOrderRecord, {
						// Late, so the cashier may be on another order by now: release this
						// one's checkout and say why, but never navigate — on a phone the
						// modal for THIS order renders the refusal itself if it is still open.
						onLateRejected: (rejection) => {
							leaveCheckout(uuid);
							showRefusal(rejection);
						},
					})
				: null;
			if (result?.outcome === 'queued-offline') return;
			if (result?.outcome === 'rejected') {
				abandon();
				showRefusal(result.rejection);
				return;
			}
			const savedDoc =
				result?.outcome === 'saved' ? result.resident : await pushDocument(currentOrderRecord);
			if (savedDoc) {
				// Re-checked after the await: the worker can die mid-push, and
				// enabling tender then would let the cashier take money
				// for an order this device can no longer record.
				if (blockIfDegraded('checkout', { orderId: currentOrderRecord.uuid })) {
					abandon();
					return;
				}

				// Log checkout started
				orderLogger.info(t('pos_cart.checkout_started'), {
					context: {
						total,
						lineItemCount: lineItems?.length ?? 0,
					},
				});
				if (!tenderFlow) router.push(sheetRoute);
			} else {
				abandon();
			}
		} catch (error) {
			abandon();
			if (tenderFlow) return;
			// A timeout carries the push state (connectivity, auth hold, queue depth,
			// last drain) so a push that never went out says why.
			reportPushFailure(orderLogger, 'Checkout failed', error, {
				fallback: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
				title: t('pos_cart.checkout_failed'),
				// The store dedupes the order on its uuid, so pressing Checkout again is safe.
				stillSendingTitle: t('pos_cart.checkout_still_sending'),
				// SYNC191's "nothing to do" would contradict the title's "press Checkout again".
				stillSendingText2: t('pos_cart.checkout_still_sending_hint'),
			});
		} finally {
			if (!tenderFlow) clearOrderSaving(uuid);
			setLoading(false);
		}
	}, [
		unmet,
		blockIfDegraded,
		pushDocument,
		save,
		currentOrderRecord,
		lineItems,
		router,
		screenSize,
		loaded,
		unsupportedSchema,
		t,
		total,
	]);
	// `pos.checkout.open` runs this same path while the button is mounted (roadmap#428).
	useRegisterSurface('pay', handlePay);

	/**
	 *
	 */
	return (
		<Animated.View
			testID="checkout-button-frame"
			className="w-full"
			// Dimmed, not `disabled` (a dead tap is a bug); the resolved beat eases back (rule 6).
			style={{
				opacity: unmet.length > 0 ? BLOCKED_OPACITY : 1,
				transitionProperty: 'opacity',
				transitionDuration: reduced ? 0 : CROSSFADE,
				transitionTimingFunction: 'ease-out',
			}}
		>
			<Button
				testID="checkout-button"
				size="lg"
				onPress={handlePay}
				// The sale button (size lg, 56), as the foot's Open/Close register. `w-full`, not
				// `flex-1`: the foot's wrapper is a column, where `flex-1` would stretch it vertically.
				className="w-full"
				loading={loading}
				disabled={storageDegraded}
			>
				{t('pos_cart.checkout', {
					order_total: format(displayTotal || 0),
				})}
			</Button>
		</Animated.View>
	);
}
