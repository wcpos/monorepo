import { getDriver, hasDriver, listDrivers, registerDriver } from './registry';
import { createSimulatedDriver } from './simulated-driver';
it('registers by provider, lists drivers and replaces an existing registration', () => {
	expect(getDriver('absent')).toBeUndefined();
	expect(hasDriver('absent')).toBe(false);
	const driver = createSimulatedDriver();
	registerDriver(driver);
	expect(getDriver('simulated')).toBe(driver);
	expect(hasDriver('simulated')).toBe(true);
	expect(listDrivers()).toContain(driver);
	const replacement = createSimulatedDriver();
	registerDriver(replacement);
	expect(getDriver('simulated')).toBe(replacement);
	expect(listDrivers().filter((d) => d.provider === 'simulated')).toEqual([replacement]);
});
