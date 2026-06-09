import { convertLocalDateToUTCString } from './use-local-date';

jest.mock('./use-locale', () => ({
	useLocale: () => ({ shortCode: 'enUS' }),
}));

describe('convertLocalDateToUTCString', () => {
	it('formats Woo REST GMT dates without a timezone suffix', () => {
		const date = new Date('2026-06-09T16:40:55.000Z');

		expect(convertLocalDateToUTCString(date)).toBe('2026-06-09T16:40:55');
	});
});
