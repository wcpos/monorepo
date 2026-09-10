import type { PaymentDriver } from './types';

const drivers = new Map<string, PaymentDriver>();
export const registerDriver = (driver: PaymentDriver): void => {
	drivers.set(driver.provider, driver);
};
export const getDriver = (provider: string | null): PaymentDriver | undefined =>
	provider ? drivers.get(provider) : undefined;
export const hasDriver = (provider: string | null): boolean => Boolean(getDriver(provider));
export const listDrivers = (): PaymentDriver[] => [...drivers.values()];
