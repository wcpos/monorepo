/**
 * Variation attribute normalization — the resurrected successor to 1.9's
 * `packages/query/tests/variations.helpers.test.ts:8-42` (six cases over
 * `normalizeVariationAttributes` in `packages/query/src/hooks/variations.helpers.ts`).
 * That helper and its suite were deleted in the sync-engine rewrite; the production
 * successor is the module-private `normalizeVariationAttributes` in
 * `variation-schema.ts`, reached through `promotedVariationColumns` — the exported
 * seam, which is what this suite drives so the guard tests the module's interface.
 *
 * WHAT THESE TESTS ARE: the ratified 1.9-parity behavior for
 * https://github.com/wcpos/monorepo/issues/811. Malformed entries whose `name` or
 * `option` are not strings are dropped rather than coerced into garbage strings.
 *
 * The `name === '' || option === ''` drops ARE deliberate and match 1.9: WooCommerce's
 * "Any <attribute>" is modelled as ABSENCE so the variation filter's
 * `$not $elemMatch` semantics work uniformly (see the type doc in variation-schema.ts).
 */
import { describe, expect, it } from 'vitest';

import { promotedVariationColumns } from './variation-schema';

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

	it('#811: drops entries with a non-string name or option (1.9 parity)', () => {
		expect(normalize([{ id: 1, name: 123, option: 'Red' }])).toEqual([]);
		expect(normalize([{ id: 2, name: 'Size', option: 456 }])).toEqual([]);
		expect(normalize([{ id: 3, name: 'Flag', option: false }])).toEqual([]);
	});

	it('#811: drops object names or options instead of stringifying them (1.9 parity)', () => {
		expect(normalize([{ id: 1, name: { rendered: 'Color' }, option: 'Red' }])).toEqual([]);
		expect(normalize([{ id: 2, name: 'Color', option: ['Red', 'Blue'] }])).toEqual([]);
	});

	it('normalizes attributes when the columns are attached to a document', () => {
		const document = {
			id: 'variation-1',
			payload: {
				id: 11,
				attributes: [{ id: 1, name: 'Color', option: 'Red' }, { name: 'Size' }, null],
			},
		};

		expect(promotedVariationColumns(document.payload)).toMatchObject({
			attributes: [{ id: 1, name: 'Color', option: 'Red' }],
		});
	});
});
