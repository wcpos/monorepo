import { CustomerDisplayService, type CustomerDisplayServiceOptions } from './service';

let service: CustomerDisplayService | null = null;
const WCPOS_V2_PREFIX = '/wcpos/v2/';

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
	return service;
}

export function getCustomerDisplayService(): CustomerDisplayService | null {
	return service;
}

export function stopCustomerDisplayService(): void {
	service?.stop();
	service = null;
}

export * from './device-id';
export * from './display-session';
export * from './envelope';
export * from './ledger';
export * from './peer';
export * from './service';
export * from './signaling-client';
export * from './snapshot';
