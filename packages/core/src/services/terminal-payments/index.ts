import { TerminalPaymentsService, type TerminalPaymentsServiceOptions } from './service';

let service: TerminalPaymentsService | null = null;
let serviceVersion = 0;
const serviceListeners = new Set<() => void>();
export const getTerminalPaymentsServiceStartVersion = () => serviceVersion;
export const subscribeTerminalPaymentsServiceStart = (listener: () => void): (() => void) => {
	serviceListeners.add(listener);
	return () => {
		serviceListeners.delete(listener);
	};
};
const notifyTerminalPaymentsServiceStart = () => {
	serviceVersion++;
	serviceListeners.forEach((listener) => listener());
};
export function startTerminalPaymentsService(
	options: TerminalPaymentsServiceOptions
): TerminalPaymentsService {
	service?.stop();
	service = new TerminalPaymentsService(options);
	notifyTerminalPaymentsServiceStart();
	return service;
}
export const getTerminalPaymentsService = () => service;
export function stopTerminalPaymentsService(): void {
	if (!service) return;
	service.stop();
	service = null;
	notifyTerminalPaymentsServiceStart();
}
export * from './service';
