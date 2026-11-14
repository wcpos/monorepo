import type { PaymentDriver } from './types';

const listeners = new Set<() => void>();
export const subscribeRegistry = (listener: () => void): (() => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
const drivers = new Map<string, PaymentDriver>();
export const registerDriver = (driver: PaymentDriver): void => {
	drivers.set(driver.provider, driver);
	listeners.forEach((listener) => listener());
};
export const getDriver = (provider: string | null): PaymentDriver | undefined =>
	provider ? drivers.get(provider) : undefined;
export const hasDriver = (provider: string | null): boolean => Boolean(getDriver(provider));
export const listDrivers = (): PaymentDriver[] => [...drivers.values()];
