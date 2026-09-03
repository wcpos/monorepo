import { CustomerDisplayService, type CustomerDisplayServiceOptions } from './service';

let service: CustomerDisplayService | null = null;

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

export * from './device-id';
export * from './display-session';
export * from './envelope';
export * from './ledger';
export * from './peer';
export * from './service';
export * from './signaling-client';
export * from './snapshot';
