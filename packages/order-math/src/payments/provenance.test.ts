import {
	hasSaleProvenance,
	saleProvenanceMeta,
	splitPlanMeta,
	withMetaReplaced,
	withSaleProvenance,
} from './provenance';

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

it.each(['even', 'fixed', 'items'] as const)(
	'serializes the %s split facts in payment order',
	(kind) => {
		expect(splitPlanMeta({ kind, ways: 3, shares: ['30.99', '30.98', '30.98'] })).toEqual({
			key: '_wcpos_split',
			value: JSON.stringify({ kind, ways: 3, shares: ['30.99', '30.98', '30.98'] }),
		});
	}
);

describe('withMetaReplaced', () => {
	const existing = [
		{ id: 7, key: '_wcpos_split', value: 'stale' },
		{ id: 8, key: '_wcpos_sale_counter', value: '1' },
	];
	it('updates an entry in place so it keeps the id Woo assigned it', () => {
		// An id-less element on the wire is an append: removing and re-adding would leave
		// the stale split on the server next to the new one.
		expect(withMetaReplaced(existing, [{ key: '_wcpos_split', value: 'fresh' }])).toEqual([
			{ id: 7, key: '_wcpos_split', value: 'fresh' },
			{ id: 8, key: '_wcpos_sale_counter', value: '1' },
		]);
	});
	it('appends an entry the order does not have', () => {
		expect(withMetaReplaced([existing[1]], [{ key: '_wcpos_split', value: 'fresh' }])).toEqual([
			existing[1],
			{ key: '_wcpos_split', value: 'fresh' },
		]);
	});
	it('a null value nulls a synced entry (Woo deletes it on push) and drops an unsynced one', () => {
		expect(withMetaReplaced(existing, [{ key: '_wcpos_split', value: null }])).toEqual([
			{ id: 7, key: '_wcpos_split', value: null },
			existing[1],
		]);
		expect(
			withMetaReplaced(
				[{ key: '_wcpos_split', value: 'never synced' }],
				[{ key: '_wcpos_split', value: null }]
			)
		).toEqual([]);
		expect(withMetaReplaced([existing[1]], [{ key: '_wcpos_split', value: null }])).toEqual([
			existing[1],
		]);
	});
	it("never hands back the caller's objects", () => {
		const result = withMetaReplaced(existing, []);
		expect(result).toEqual(existing);
		expect(result[0]).not.toBe(existing[0]);
	});
});
