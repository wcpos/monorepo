import * as React from 'react';

import type { PaymentMethodDescriptor, PaymentTransport } from '@wcpos/order-math';

import { getDriver, listDrivers } from '../../../../../services/payment-drivers/registry';

import type { DriverStatus, PaymentDriver } from '../../../../../services/payment-drivers/types';

const disconnected: DriverStatus = { connection: 'disconnected', reader: null };
export function useDriverStatus(driver: PaymentDriver | undefined) {
	const subscribe = React.useCallback(
		(listener: () => void) => driver?.status$.subscribe(listener) ?? (() => {}),
		[driver]
	);
	const get = React.useCallback(() => driver?.status$.get() ?? disconnected, [driver]);
	return React.useSyncExternalStore(subscribe, get, get);
}
export function driverReady(
	method: PaymentMethodDescriptor | null,
	transport: PaymentTransport | null
) {
	const driver = getDriver(method?.capture.provider ?? null);
	const status = driver?.status$.get();
	return Boolean(
		transport &&
		driver?.availability().available &&
		(driver.capabilities.discovery === 'sdk_ui' ||
			(status?.connection === 'connected' && status.reader?.transport === transport))
	);
}

/** Availability can change while no keypad is selected (permission/Bluetooth/login). */
export function useDriverChanges() {
	const [, changed] = React.useReducer((value) => value + 1, 0);
	// Drivers register at app startup; their external status streams invalidate tile availability.
	React.useEffect(() => {
		const unsubscribers = listDrivers().map((driver) => driver.status$.subscribe(changed));
		return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
	}, []);
}
