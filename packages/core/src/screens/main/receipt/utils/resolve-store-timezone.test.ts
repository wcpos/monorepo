import { resolveStoreTimezone } from './resolve-store-timezone';

describe('resolveStoreTimezone', () => {
	it('uses the store timezone before the site timezone', () => {
		expect(
			resolveStoreTimezone({ timezone: 'Europe/Madrid' }, { timezone_string: 'America/New_York' })
		).toBe('Europe/Madrid');
	});

	it('falls back to the site timezone string', () => {
		expect(resolveStoreTimezone({ timezone: '' }, { timezone_string: 'America/New_York' })).toBe(
			'America/New_York'
		);
	});

	it('converts whole-hour gmt_offset values to POSIX Etc/GMT names', () => {
		expect(resolveStoreTimezone({}, { timezone_string: '', gmt_offset: '-5' })).toBe('Etc/GMT+5');
		expect(resolveStoreTimezone({}, { timezone_string: '', gmt_offset: '2' })).toBe('Etc/GMT-2');
	});

	it('falls back to UTC when no safe timezone is available', () => {
		expect(resolveStoreTimezone({}, { timezone_string: '', gmt_offset: '5.5' })).toBe('UTC');
		expect(resolveStoreTimezone()).toBe('UTC');
	});
});
