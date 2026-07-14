/**
 * @jest-environment node
 */
import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { expiryPresetToDate } from './expiry-presets';

jest.mock('../../../../hooks/use-locale', () => ({
	useLocale: () => ({ shortCode: 'enUS' }),
}));

// A fixed local instant; assertions round-trip through the UTC string so they
// hold in any TZ the test machine runs in.
const NOW = new Date(2026, 6, 13, 15, 30, 0); // 13 Jul 2026 15:30 local

describe('expiryPresetToDate', () => {
	it('end_of_day resolves to 23:59:59 local time today', () => {
		const result = expiryPresetToDate('end_of_day', NOW);
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/); // _gmt shape, no Z
		const local = convertUTCStringToLocalDate(result);
		expect(local.getFullYear()).toBe(2026);
		expect(local.getMonth()).toBe(6);
		expect(local.getDate()).toBe(13);
		expect(local.getHours()).toBe(23);
		expect(local.getMinutes()).toBe(59);
		expect(local.getSeconds()).toBe(59);
	});

	it('one_week resolves to end of the local day 7 days out', () => {
		const local = convertUTCStringToLocalDate(expiryPresetToDate('one_week', NOW));
		expect(local.getDate()).toBe(20);
		expect(local.getMonth()).toBe(6);
		expect(local.getHours()).toBe(23);
	});

	it('one_month resolves to end of the local day 1 month out', () => {
		const local = convertUTCStringToLocalDate(expiryPresetToDate('one_month', NOW));
		expect(local.getDate()).toBe(13);
		expect(local.getMonth()).toBe(7); // August
		expect(local.getHours()).toBe(23);
	});

	it('is always in the future relative to now', () => {
		for (const preset of ['end_of_day', 'one_week', 'one_month'] as const) {
			const local = convertUTCStringToLocalDate(expiryPresetToDate(preset, NOW));
			expect(local.getTime()).toBeGreaterThan(NOW.getTime());
		}
	});
});
