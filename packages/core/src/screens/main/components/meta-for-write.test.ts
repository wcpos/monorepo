/** @jest-environment node */
import { metaForWrite } from './meta-for-write';

describe('metaForWrite', () => {
	it('drops blank new rows but keeps numbered rows and non-empty keys', () => {
		expect(
			metaForWrite(
				[{ key: '', value: '' }, {}, { id: 1, key: '', value: null }, { key: 'a', value: 'b' }],
				[],
				new Set()
			)
		).toEqual([
			{ id: 1, key: '', value: null },
			{ key: 'a', value: 'b' },
		]);
	});

	it('adopts the stored id for an id-less draft row', () => {
		expect(
			metaForWrite([{ key: 'colour', value: 'blue' }], [{ id: 9, key: 'colour' }], new Set())
		).toEqual([{ id: 9, key: 'colour', value: 'blue' }]);
	});

	it('claims distinct stored ids for duplicate keys, reserving ids already in the draft', () => {
		expect(
			metaForWrite(
				[
					{ key: 'a', value: 'first' },
					{ id: 1, key: 'a' },
					{ key: 'a', value: 'second' },
				],
				[
					{ id: 1, key: 'a' },
					{ id: 2, key: 'a' },
					{ id: 3, key: 'a' },
				],
				new Set()
			)
		).toEqual([
			{ id: 2, key: 'a', value: 'first' },
			{ id: 1, key: 'a' },
			{ id: 3, key: 'a', value: 'second' },
		]);
	});

	it('tombstones a numbered row this form wrote and then removed', () => {
		expect(metaForWrite([], [{ id: 9, key: 'colour', value: 'red' }], new Set(['colour']))).toEqual(
			[{ id: 9, key: 'colour', value: null }]
		);
	});

	it('does not delete rows that arrived from the store independently', () => {
		expect(metaForWrite([], [{ id: 9, key: 'external', value: 'red' }], new Set())).toEqual([]);
	});

	it('leaves a second row under a key the draft still holds: another device added it, this form did not remove it', () => {
		expect(
			metaForWrite(
				[{ id: 9, key: 'colour', value: 'red' }],
				[
					{ id: 9, key: 'colour', value: 'red' },
					{ id: 12, key: 'colour', value: 'blue' },
				],
				new Set(['colour'])
			)
		).toEqual([{ id: 9, key: 'colour', value: 'red' }]);
	});

	it('tracks non-null written keys, not a draft tombstone, and tombstones a renamed partial key', () => {
		const written = new Set(['col']);
		expect(
			metaForWrite(
				[
					{ key: 'colour', value: 'red' },
					{ id: 4, key: 'removed', value: null },
				],
				[{ id: 9, key: 'col', value: 'red' }],
				written
			)
		).toEqual([
			{ key: 'colour', value: 'red' },
			{ id: 4, key: 'removed', value: null },
			{ id: 9, key: 'col', value: null },
		]);
		expect(written).toEqual(new Set(['col', 'colour']));
	});
});
