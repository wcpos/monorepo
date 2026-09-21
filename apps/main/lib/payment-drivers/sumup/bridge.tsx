import * as React from 'react';
import { AppState } from 'react-native';

import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { getSumUpReader } from '../../../modules/sumup-reader';

import type { createSumUpDriver } from './driver';

export function SumUpDriverBridge({
	driver,
	methods,
}: {
	driver: ReturnType<typeof createSumUpDriver>;
	methods?: readonly PaymentMethodDescriptor[];
}) {
	// Reconcile an external SDK on startup, descriptor refresh and app foreground.
	React.useEffect(() => {
		const refresh = () => {
			void driver.initialize().then(driver.refreshStatus).catch(driver.reportError);
		};
		refresh();
		const subscription = AppState.addEventListener('change', (state) => {
			if (state === 'active') refresh();
		});
		const native = getSumUpReader()?.addListener('onReaderStatus', () => {
			void driver.refreshStatus().catch(driver.reportError);
		});
		return () => {
			subscription.remove();
			native?.remove();
		};
	}, [driver, methods]);
	return null;
}
