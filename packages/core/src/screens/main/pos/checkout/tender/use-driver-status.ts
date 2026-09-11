import * as React from 'react';

import type { PaymentMethodDescriptor, PaymentTransport } from '@wcpos/order-math';

import {
	getDriver,
	listDrivers,
	subscribeRegistry,
} from '../../../../../services/payment-drivers/registry';

import type { DriverStatus, PaymentDriver } from '../../../../../services/payment-drivers/types';

const disconnected: DriverStatus = { connection: 'disconnected', reader: null };

function shallowEqual(a: Record<string, unknown> | null, b: Record<string, unknown> | null) {
	if (a === b) return true;
	if (!a || !b) return false;
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	for (const key of keys) if (a[key] !== b[key]) return false;
	return true;
}

function sameStatus(a: DriverStatus, b: DriverStatus): boolean {
	if (a === b) return true;
	const { reader: readerA, ...restA } = a;
	const { reader: readerB, ...restB } = b;
	return (
		shallowEqual(restA, restB) &&
		shallowEqual(
			readerA as Record<string, unknown> | null,
			readerB as Record<string, unknown> | null
		)
	);
}

export function useDriverStatus(driver: PaymentDriver | undefined) {
	const subscribe = React.useCallback(
		(listener: () => void) => driver?.status$.subscribe(listener) ?? (() => {}),
		[driver]
	);
	// useSyncExternalStore re-renders forever when getSnapshot returns a fresh object each
	// call. A driver that builds its status on every get() (an extension's, not ours) must
	// still yield a stable snapshot, so the last equal value is returned instead.
	const last = React.useRef<DriverStatus>(disconnected);
	const get = React.useCallback(() => {
		const next = driver?.status$.get() ?? disconnected;
		if (sameStatus(last.current, next)) return last.current;
		last.current = next;
		return next;
	}, [driver]);
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
		status?.connection === 'connected' &&
		status.reader?.transport === transport
	);
}

/** Availability can change while no keypad is selected (permission/Bluetooth/login). */
export function useDriverChanges() {
	const [, changed] = React.useReducer((value) => value + 1, 0);
	// Registry changes can arrive after mount; rebind external status streams as drivers change.
	React.useEffect(() => {
		let unsubscribers: (() => void)[] = [];
		const update = () => {
			unsubscribers.forEach((unsubscribe) => unsubscribe());
			unsubscribers = listDrivers().map((driver) => driver.status$.subscribe(changed));
			changed();
		};
		const unsubscribeRegistry = subscribeRegistry(update);
		update();
		return () => {
			unsubscribeRegistry();
			unsubscribers.forEach((unsubscribe) => unsubscribe());
		};
	}, []);
}
