import { DEFAULT_IDLE_SOAK_MS, resolveIdleSoakMs } from '../e2e/idle-backfill-soak-duration';

jest.resetModules();

describe('resolveIdleSoakMs', () => {
	it('uses a pressure-aware default when SOAK_MS is missing or invalid', () => {
		expect(DEFAULT_IDLE_SOAK_MS).toBe(12 * 60_000);
		for (const value of [undefined, '', '10m', '0', '-1', 'Infinity']) {
			expect(resolveIdleSoakMs(value)).toBe(DEFAULT_IDLE_SOAK_MS);
		}
	});

	it('preserves a finite positive SOAK_MS value', () => {
		expect(resolveIdleSoakMs('900000')).toBe(900_000);
	});
});
