import * as React from 'react';
import { AppState } from 'react-native';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
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
	const online = useOnlineStatus().status === 'online-website-available';
	// Reconcile an external SDK on startup, descriptor refresh, app foreground and reconnect;
	// online, an offline SumUp session ends so its payments upload for Pro to find.
	React.useEffect(() => {
		const refresh = () => {
			void driver
				.initialize()
				.then(driver.refreshStatus)
				.then(() => (online ? driver.syncOffline() : undefined))
				.catch(driver.reportError);
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
	}, [driver, methods, online]);
	return null;
}
