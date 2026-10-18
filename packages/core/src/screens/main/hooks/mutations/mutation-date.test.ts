import { convertLocalDateToUTCString as original } from '../../../../hooks/use-local-date';
import { convertLocalDateToUTCString as relocated } from '../../../../../../query/src/mutations/date';

jest.mock('../../../../hooks/use-locale', () => ({ useLocale: () => ({ shortCode: 'en' }) }));

it.each([
	'2026-03-29T00:59:59.999Z',
	'2026-10-25T01:00:00.001Z',
	'2000-02-29T23:59:59.999Z',
	'0000-01-01T00:00:00.000Z',
	'+010000-01-01T00:00:00.000Z',
])('retains the original UTC timestamp bytes for %s', (input) => {
	const date = new Date(input);
	expect(relocated(date)).toBe(original(date));
});
it('does not substitute ISO slicing for the original extended-year formatter', () => {
	const date = new Date('+010000-01-01T00:00:00.000Z');
	expect(relocated(date)).not.toBe(date.toISOString().slice(0, 19));
});
