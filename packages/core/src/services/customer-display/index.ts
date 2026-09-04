import { CustomerDisplayService, type CustomerDisplayServiceOptions } from './service';

let service: CustomerDisplayService | null = null;
const WCPOS_V2_PREFIX = '/wcpos/v2/';

// Start/stop notifier. Screens that render before the service exists (the
// settings page on a cold load) subscribe here and re-read
// getCustomerDisplayService() when it changes. It lives in this module so a
// caller cannot start or stop the service without subscribers hearing of it.
let serviceVersion = 0;
const serviceListeners = new Set<() => void>();

export const getCustomerDisplayServiceStartVersion = (): number => serviceVersion;
export const subscribeCustomerDisplayServiceStart = (listener: () => void): (() => void) => {
	serviceListeners.add(listener);
	return () => {
		serviceListeners.delete(listener);
	};
};
export const notifyCustomerDisplayServiceStart = (): void => {
	serviceVersion += 1;
	serviceListeners.forEach((listener) => listener());
};

export function isSupportedDisplayAdvertisement(
	display: unknown
): display is { contract: 1; signaling: string } {
	if (!display || typeof display !== 'object') return false;
	const advertisement = display as { contract?: unknown; signaling?: unknown };
	return (
		advertisement.contract === 1 &&
		typeof advertisement.signaling === 'string' &&
		advertisement.signaling.startsWith(WCPOS_V2_PREFIX)
	);
}

export function startCustomerDisplayService(
	options: CustomerDisplayServiceOptions
): CustomerDisplayService {
	service?.stop();
	service = new CustomerDisplayService(options);
	service.start();
	notifyCustomerDisplayServiceStart();
	return service;
}

export function getCustomerDisplayService(): CustomerDisplayService | null {
	return service;
}

export function stopCustomerDisplayService(): void {
	if (!service) return;
	service.stop();
	service = null;
	notifyCustomerDisplayServiceStart();
}

export * from './device-id';
export * from './display-session';
export * from './envelope';
export * from './ledger';
export * from './peer';
export * from './service';
export * from './signaling-client';
export * from './snapshot';
