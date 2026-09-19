/**
 * Research pin for monorepo#2073 (`.claude/research/2026-09-16-search-scan-scale/`): the
 * proposed replacement for the FlexSearch product index — one flat folded-text blob per
 * collection with a row-offset table, `indexOf` per term, set intersection for AND — answers
 * every named trap in the enshrined search contract (`searchFixtureCatalogue.ts`) with exactly
 * the fixture's expected id SET. Ordering (exact sku/barcode first, then id descending) is the
 * consumer's job, as it is for the index today, so it is applied here the same way.
 *
 * The term rule is the fixture's own: fold, split on whitespace/control, strip wrapping
 * punctuation, keep every term including one- and two-character ones. No minimum length.
 */
import { describe, expect, it } from 'vitest';

import {
	SEARCH_FIXTURE_PRODUCTS,
	SEARCH_FIXTURE_TRAPS,
	searchFixtureExpectedIds,
	type SearchFixtureProduct,
} from './searchFixtureCatalogue';
import { foldSearchText } from './searchIndexConfig';

type Blob = { text: string; offsets: Uint32Array; ids: number[] };

function buildBlob(products: readonly SearchFixtureProduct[]): Blob {
	const rows = products.map((p) => foldSearchText([p.name, p.sku, p.barcode].join(' ')));
	const offsets = new Uint32Array(rows.length + 1);
	let position = 0;
	rows.forEach((row, i) => {
		offsets[i] = position;
		position += row.length + 1;
	});
	offsets[rows.length] = position;
	return { text: rows.join('\n') + '\n', offsets, ids: products.map((p) => p.id) };
}

function rowAt(offsets: Uint32Array, position: number): number {
	let low = 0;
	let high = offsets.length - 2;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (offsets[mid] <= position) low = mid;
		else high = mid - 1;
	}
	return low;
}

function termRows(blob: Blob, term: string): Set<number> {
	const rows = new Set<number>();
	let position = blob.text.indexOf(term);
	while (position !== -1) {
		const row = rowAt(blob.offsets, position);
		rows.add(row);
		position = blob.text.indexOf(term, blob.offsets[row + 1]);
	}
	return rows;
}

function searchTerms(query: string): string[] {
	return foldSearchText(query)
		.split(/[\p{Z}\p{C}]+/u)
		.map((term) => term.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ''))
		.filter(Boolean);
}

function blobSearch(blob: Blob, query: string): number[] {
	const terms = searchTerms(query).sort((a, b) => b.length - a.length);
	if (terms.length === 0) return [];
	let rows = termRows(blob, terms[0]);
	for (const term of terms.slice(1)) {
		if (rows.size === 0) break;
		const next = termRows(blob, term);
		rows = new Set([...rows].filter((row) => next.has(row)));
	}
	return [...rows].map((row) => blob.ids[row]);
}

describe('flat folded blob against the enshrined search contract', () => {
	const blob = buildBlob(SEARCH_FIXTURE_PRODUCTS);
	const byId = new Map(SEARCH_FIXTURE_PRODUCTS.map((p) => [p.id, p]));
	const rank = (id: number, query: string) => {
		const p = byId.get(id)!;
		const folded = foldSearchText(query).trim();
		return foldSearchText(p.sku) === folded ||
			(p.barcode !== '' && foldSearchText(p.barcode) === folded)
			? 0
			: 1;
	};

	for (const trap of SEARCH_FIXTURE_TRAPS) {
		it(`answers "${trap.name}" (${trap.query})`, () => {
			const ids = blobSearch(blob, trap.query).sort(
				(a, b) => rank(a, trap.query) - rank(b, trap.query) || b - a
			);
			expect(ids).toEqual(trap.expectedIds);
			expect(ids).toEqual(searchFixtureExpectedIds(trap.query));
		});
	}

	// No trap query carries wrapping punctuation, so the stripping rule needs its own cases:
	// the fixture's reference matcher is the oracle. A raw regex/indexOf over the typed term
	// answers these with fewer rows (the `01234-` divergence in the RxDB bench).
	for (const query of ['RED-1,', '(banana berry)', 'skoda.', '"k2"']) {
		it(`strips wrapping punctuation like the contract: ${query}`, () => {
			const expected = searchFixtureExpectedIds(query);
			expect(expected.length).toBeGreaterThan(0);
			expect([...blobSearch(blob, query)].sort((a, b) => b - a)).toEqual(
				[...expected].sort((a, b) => b - a)
			);
		});
	}
});
