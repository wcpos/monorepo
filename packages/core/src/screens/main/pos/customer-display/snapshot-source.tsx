import * as React from 'react';

import type { PaymentRow } from '@wcpos/order-math';

import { useT } from '../../../../contexts/translations';
import {
	derivePaymentEvent,
	getCustomerDisplayService,
} from '../../../../services/customer-display';
import { COUPON_TOTALS_DEBOUNCE_MS } from '../hooks/use-order-totals';
import {
	getCustomerDisplayServiceStartVersion,
	subscribeCustomerDisplayServiceStart,
} from './customer-display-service-start';
import { useDisplaySnapshot } from './use-display-snapshot';

let mountedSources = 0;
let deferredClearGeneration = 0;

export function CustomerDisplaySnapshotSource(): null {
	const snapshot = useDisplaySnapshot();
	const t = useT();
	const serviceStartVersion = React.useSyncExternalStore(
		subscribeCustomerDisplayServiceStart,
		getCustomerDisplayServiceStartVersion,
		getCustomerDisplayServiceStartVersion
	);
	const previous = React.useRef<{
		orderUuid: string;
		rows: PaymentRow[];
		orderStatus: string;
	} | null>(null);

	React.useEffect(() => {
		mountedSources += 1;
		deferredClearGeneration += 1;
		return () => {
			mountedSources -= 1;
			const generation = ++deferredClearGeneration;
			queueMicrotask(() => {
				if (mountedSources === 0 && deferredClearGeneration === generation) {
					getCustomerDisplayService()?.publish({
						action: 'display.idle',
						payload: { reason: 'no_cart' },
					});
				}
			});
		};
	}, []);

	React.useEffect(() => {
		const publish = () => {
			const service = getCustomerDisplayService();
			if (!service) return;
			if (!snapshot) {
				service.publish({ action: 'display.idle', payload: { reason: 'no_cart' } });
				previous.current = null;
				return;
			}

			const prior = previous.current;
			if (snapshot.isEmpty) {
				service.publish({ action: 'display.idle', payload: { reason: 'no_cart' } });
			} else {
				const paymentEvent =
					prior === null || prior.orderUuid === snapshot.orderUuid
						? derivePaymentEvent(
								prior?.rows ?? [],
								snapshot.rows,
								prior?.orderStatus ?? '',
								snapshot.orderStatus,
								snapshot.ledger,
								t('pos_checkout.customer_display_payment_declined')
							)
						: null;
				service.publish(
					paymentEvent
						? {
								action: 'payment.state',
								payload: { order: snapshot.order, ledger: snapshot.ledger, ...paymentEvent },
							}
						: {
								action: 'cart.updated',
								payload: { order: snapshot.order, ledger: snapshot.ledger },
							}
				);
			}
			previous.current = {
				orderUuid: snapshot.orderUuid,
				rows: snapshot.rows,
				orderStatus: snapshot.orderStatus,
			};
		};

		if (!snapshot?.hasCoupons) {
			publish();
			return;
		}
		const timer = setTimeout(publish, COUPON_TOTALS_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [serviceStartVersion, snapshot, t]);

	return null;
}
