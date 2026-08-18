import { createFakeCarrier } from './fake';
import { POS_META_KEYS, type PosCarrier, wooMetaCarrier } from './carrier';

it('freezes POS metadata wire keys', () => {
	expect(POS_META_KEYS.posData).toBe('_woocommerce_pos_data');
	expect(POS_META_KEYS.lineUuid).toBe('_woocommerce_pos_uuid');
});

type CarrierFactory = () => PosCarrier;

const carrierFactories: [string, CarrierFactory][] = [
	['Woo metadata', () => wooMetaCarrier],
	['fake', () => createFakeCarrier()],
];

describe.each(carrierFactories)('%s PosCarrier contract', (_name, createCarrier) => {
	it('round-trips stamped identity without mutating the input', () => {
		const carrier = createCarrier();
		const input = [{ id: 1, key: 'custom', value: 'keep' }];

		const stamped = carrier.stampIdentity(input, { userId: 7, storeId: 11 });

		expect(stamped).not.toBe(input);
		expect(input).toEqual([{ id: 1, key: 'custom', value: 'keep' }]);
		expect(stamped).toEqual([
			{ id: 1, key: 'custom', value: 'keep' },
			{ key: '_pos_user', value: '7' },
			{ key: '_pos_store', value: '11' },
		]);
		expect(carrier.readIdentity(stamped)).toEqual({
			cashierId: '7',
			storeId: '11',
		});
	});

	it('re-stamps identity idempotently and replaces duplicate entries', () => {
		const carrier = createCarrier();
		const input = [
			{ id: 21, key: '_pos_user', value: 'old-user' },
			{ key: '_pos_user', value: 'duplicate-user' },
			{ id: 22, key: '_pos_store', value: 'old-store' },
			{ key: 'custom', value: true },
		];

		const once = carrier.stampIdentity(input, { userId: 7, storeId: 11 });
		const twice = carrier.stampIdentity(once, { userId: 7, storeId: 11 });

		expect(once).toEqual([
			{ id: 21, key: '_pos_user', value: '7' },
			{ id: 22, key: '_pos_store', value: '11' },
			{ key: 'custom', value: true },
		]);
		expect(twice).toEqual(once);
		expect(twice).not.toBe(once);
	});

	it('tolerates malformed metadata and reads only scalar identity values', () => {
		const carrier = createCarrier();

		expect(carrier.readIdentity(undefined)).toEqual({
			cashierId: null,
			storeId: null,
		});
		expect(carrier.readIdentity({} as never)).toEqual({
			cashierId: null,
			storeId: null,
		});
		expect(
			carrier.readIdentity([
				{},
				{ key: '_pos_user', value: { id: 7 } },
				{ key: '_pos_user', value: 8 },
				{ key: '_pos_store', value: '' },
			])
		).toEqual({ cashierId: '8', storeId: null });
		expect(carrier.taxBasedOnOverride({} as never)).toBeNull();
		expect(
			carrier.taxBasedOnOverride([
				{},
				{ key: '_woocommerce_pos_tax_based_on', value: 7 },
				{ key: '_woocommerce_pos_tax_based_on', value: 'billing' },
			])
		).toBe('billing');
	});

	it('ensures a line uuid and calls the mint function only once', () => {
		const carrier = createCarrier();
		const line = {
			name: 'Item',
			meta_data: [{ key: 'custom', value: 'keep' }],
		};
		let mintCount = 0;
		const mintUuid = () => `minted-${++mintCount}`;

		const ensured = carrier.ensureLineUuid(line, mintUuid);
		const ensuredAgain = carrier.ensureLineUuid(ensured, mintUuid);

		expect(ensured).not.toBe(line);
		expect(ensured).toEqual({
			name: 'Item',
			meta_data: [
				{ key: 'custom', value: 'keep' },
				{ key: '_woocommerce_pos_uuid', value: 'minted-1' },
			],
		});
		expect(ensuredAgain).toBe(ensured);
		expect(carrier.lineUuid(ensuredAgain)).toBe('minted-1');
		expect(mintCount).toBe(1);
	});

	it('round-trips identity filter fragments', () => {
		const carrier = createCarrier();
		const filter = carrier.identityFilter({ cashierId: '7', storeId: '3' });

		expect(filter).toEqual({
			$and: [
				{ meta_data: { $elemMatch: { key: '_pos_user', value: '7' } } },
				{ meta_data: { $elemMatch: { key: '_pos_store', value: '3' } } },
			],
		});
		expect(carrier.decodeIdentityFilter(filter)).toEqual({
			cashierId: '7',
			storeId: '3',
		});
		expect(carrier.decodeIdentityFilter({ status: 'processing' })).toBeNull();
	});
});

it('exposes fake carrier state for tests', () => {
	const carrier = createFakeCarrier();
	const stamped = carrier.stampIdentity(undefined, {
		userId: '7',
		storeId: '3',
	});
	const line = carrier.ensureLineUuid({}, () => 'line-1');
	carrier.taxBasedOnOverride([{ key: '_woocommerce_pos_tax_based_on', value: 'shipping' }]);

	expect(carrier.readIdentity(stamped)).toEqual({
		cashierId: '7',
		storeId: '3',
	});
	expect(carrier.lineUuid(line)).toBe('line-1');
	expect(carrier.state).toEqual({
		cashierId: '7',
		storeId: '3',
		taxBasedOn: 'shipping',
		lineUuids: ['line-1'],
	});
});

it('uses initial fake state without requiring Woo metadata fixtures', () => {
	const carrier = createFakeCarrier({
		cashierId: '4',
		storeId: '8',
		taxBasedOn: 'billing',
		lineUuids: ['existing-line'],
	});

	expect(carrier.readIdentity(undefined)).toEqual({
		cashierId: '4',
		storeId: '8',
	});
	expect(carrier.taxBasedOnOverride(undefined)).toBe('billing');
	const line = carrier.ensureLineUuid({}, () => 'new-line');
	expect(carrier.lineUuid(line)).toBe('new-line');
	expect(carrier.state.lineUuids).toEqual(['existing-line', 'new-line']);
});
