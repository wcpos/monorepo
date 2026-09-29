import * as React from 'react';

/**
 * The rail's cashier sheet lives outside the POS screen, but the register picker lives in
 * `OpenOrders`. "Switch register" from the rail raises this flag; the POS screen consumes it
 * when it is mounted (at once on the POS, or on arrival when the cashier was elsewhere).
 */
let requested = false;
const listeners = new Set<() => void>();

export function requestRegisterPicker() {
	requested = true;
	listeners.forEach((listener) => listener());
}

export function consumeRegisterPickerRequest(): boolean {
	const was = requested;
	requested = false;
	if (was) listeners.forEach((listener) => listener());
	return was;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useRegisterPickerRequested(): boolean {
	return React.useSyncExternalStore(
		subscribe,
		() => requested,
		() => false
	);
}
