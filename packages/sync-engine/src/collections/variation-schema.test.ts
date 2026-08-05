/**
 * Variation attribute normalization — the resurrected successor to 1.9's
 * `packages/query/tests/variations.helpers.test.ts:8-42` (six cases over
 * `normalizeVariationAttributes` in `packages/query/src/hooks/variations.helpers.ts`).
 * That helper and its suite were deleted in the sync-engine rewrite; the production
 * successor is the module-private `normalizeVariationAttributes` in
 * `variation-schema.ts`, reached through `promotedVariationColumns` /
 * `withVariationColumns` — the exported seam, which is what this suite drives so the
 * guard tests the module's interface rather than a private symbol.
 *
 * WHAT THESE TESTS ARE: a pin of TODAY'S behaviour, not a ratification of it.
 *
 * 1.9 DROPPED entries whose `name`/`option` were not strings. The current code
 * COERCES them (`String(...)`), so `123` survives as `'123'` and `{}` survives as
 * `'[object Object]'` — a live divergence tracked as
 * https://github.com/wcpos/monorepo/issues/811 (milestone v1.11.0, deferred by the
 * owner). The coercion cases below are marked `#811`. They are a TRIPWIRE: when #811
 * lands and restores 1.9's drop semantics, FLIP those cases (assert the malformed
 * entries are filtered out) rather than deleting them. Nothing here should be read as
 * a decision that coercion is correct.
 *
 * The `name === '' || option === ''` drops ARE deliberate and match 1.9: WooCommerce's
 * "Any <attribute>" is modelled as ABSENCE so the variation filter's
 * `$not $elemMatch` semantics work uniformly (see the type doc in variation-schema.ts).
 */
import { describe, expect, it } from 'vitest';

import { promotedVariationColumns, withVariationColumns } from './variation-schema';

/** Drive the module-private normalizer through its exported seam. */
const normalize = (attributes: unknown) =>
	promotedVariationColumns({ attributes } as Record<string, unknown>).attributes;

describe('variation attribute normalization', () => {
	it('keeps valid attributes, carrying the promoted numeric id', () => {
		expect(
			normalize([
				{ id: 1, name: 'Color', option: 'Red' },
				{ id: 2, name: 'Size', option: 'Large' },
			])
		).toEqual([
			{ id: 1, name: 'Color', option: 'Red' },
			{ id: 2, name: 'Size', option: 'Large' },
		]);
	});

	it('defaults a missing or unparseable id to 0 rather than dropping the entry', () => {
		expect(normalize([{ name: 'Color', option: 'Red' }])).toEqual([
			{ id: 0, name: 'Color', option: 'Red' },
		]);
		expect(normalize([{ id: 'not-a-number', name: 'Color', option: 'Red' }])).toEqual([
			{ id: 0, name: 'Color', option: 'Red' },
		]);
		expect(normalize([{ id: '7', name: 'Color', option: 'Red' }])).toEqual([
			{ id: 7, name: 'Color', option: 'Red' },
		]);
	});

	it('filters out entries missing a name', () => {
		expect(normalize([{ option: 'Red' }, { id: 2, name: 'Size', option: 'Large' }])).toEqual([
			{ id: 2, name: 'Size', option: 'Large' },
		]);
	});

	it('filters out entries missing an option — WooCommerce "Any <attribute>" is absence', () => {
		expect(
			normalize([
				{ id: 1, name: 'Color' },
				{ id: 2, name: 'Size', option: 'Large' },
			])
		).toEqual([{ id: 2, name: 'Size', option: 'Large' }]);
		// An explicitly empty option is the same "Any" case.
		expect(normalize([{ id: 1, name: 'Color', option: '' }])).toEqual([]);
	});

	it('filters out null and non-object entries', () => {
		expect(
			normalize([null, undefined, 'Color', 42, { id: 2, name: 'Size', option: 'Large' }])
		).toEqual([{ id: 2, name: 'Size', option: 'Large' }]);
	});

	it('treats a null name or option as absent', () => {
		expect(normalize([{ id: 1, name: null, option: 'Red' }])).toEqual([]);
		expect(normalize([{ id: 1, name: 'Color', option: null }])).toEqual([]);
	});

	it('returns an empty array for non-array input', () => {
		expect(normalize(null)).toEqual([]);
		expect(normalize(undefined)).toEqual([]);
		expect(normalize('Color')).toEqual([]);
		expect(normalize({ name: 'Color', option: 'Red' })).toEqual([]);
	});

	it('returns an empty array for empty input', () => {
		expect(normalize([])).toEqual([]);
	});

	/**
	 * #811 TRIPWIRE — pins the CURRENT coercion. 1.9 dropped these entries.
	 * When https://github.com/wcpos/monorepo/issues/811 lands, flip this case to expect
	 * `[]` (and the object case below to expect the malformed entry filtered out).
	 */
	it('#811: COERCES a non-string name or option instead of dropping the entry (1.9 dropped)', () => {
		expect(normalize([{ id: 1, name: 123, option: 'Red' }])).toEqual([
			{ id: 1, name: '123', option: 'Red' },
		]);
		expect(normalize([{ id: 2, name: 'Size', option: 456 }])).toEqual([
			{ id: 2, name: 'Size', option: '456' },
		]);
		expect(normalize([{ id: 3, name: 'Flag', option: false }])).toEqual([
			{ id: 3, name: 'Flag', option: 'false' },
		]);
	});

	/**
	 * #811 TRIPWIRE — this is the `[object Object]` that reaches cart metadata and the
	 * variation filter today. Flip when #811 lands.
	 */
	it('#811: stringifies an object name or option to "[object Object]" (1.9 dropped)', () => {
		expect(normalize([{ id: 1, name: { rendered: 'Color' }, option: 'Red' }])).toEqual([
			{ id: 1, name: '[object Object]', option: 'Red' },
		]);
		expect(normalize([{ id: 2, name: 'Color', option: ['Red', 'Blue'] }])).toEqual([
			{ id: 2, name: 'Color', option: 'Red,Blue' },
		]);
	});

	it('normalizes attributes when the columns are attached to a document', () => {
		const document = {
			id: 'variation-1',
			payload: {
				id: 11,
				attributes: [{ id: 1, name: 'Color', option: 'Red' }, { name: 'Size' }, null],
			},
		};

		expect(withVariationColumns(document)).toMatchObject({
			id: 'variation-1',
			attributes: [{ id: 1, name: 'Color', option: 'Red' }],
		});
	});
});
