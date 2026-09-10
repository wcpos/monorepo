import { hasSaleProvenance, saleProvenanceMeta, withSaleProvenance } from './provenance';

it('stamps seconds precision at the device offset, with timezone and optional session', () => {
	const offset = jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-120);
	const entries = saleProvenanceMeta({
		registerId: 'register',
		saleCounter: 3,
		now: new Date('2026-09-10T22:42:10.987Z'),
		timeZone: 'Europe/Madrid',
		appVersion: 'version',
		appBuild: 'build',
		sessionId: null,
	});
	expect(Object.fromEntries(entries.map(({ key, value }) => [key, value]))).toEqual({
		_wcpos_register: 'register',
		_wcpos_sale_counter: '3',
		_wcpos_sale_time: '2026-09-11T00:42:10+02:00',
		_wcpos_sale_tz: 'Europe/Madrid',
		_wcpos_app_version: 'version',
		_wcpos_app_build: 'build',
	});
	expect(hasSaleProvenance(entries)).toBe(true);
	expect(hasSaleProvenance([])).toBe(false);
	expect(withSaleProvenance(entries, entries)).toEqual(entries);
	expect(
		withSaleProvenance([{ key: '_wcpos_register', value: 'original' }], entries)[0].value
	).toBe('original');
	offset.mockRestore();
});

it.each([
	[330, '-05:30'],
	[0, '+00:00'],
] as const)('formats offset %s and an optional session', (minutes, suffix) => {
	const offset = jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(minutes);
	const input = {
		registerId: 'r',
		saleCounter: 1,
		now: new Date('2026-09-11T12:00:00Z'),
		timeZone: '',
		appVersion: 'v',
		appBuild: 'b',
		sessionId: 's',
	};
	const entries = saleProvenanceMeta(input);
	expect(entries.find(({ key }) => key === '_wcpos_sale_time')?.value).toEqual(
		expect.stringMatching(new RegExp(suffix.replace('+', '\\+') + '$'))
	);
	expect(entries).toContainEqual({ key: '_wcpos_sale_tz', value: 'UTC' });
	expect(entries).toContainEqual({ key: '_wcpos_session', value: 's' });
	expect(
		saleProvenanceMeta({ ...input, sessionId: '' }).some(({ key }) => key === '_wcpos_session')
	).toBe(false);
	offset.mockRestore();
});
