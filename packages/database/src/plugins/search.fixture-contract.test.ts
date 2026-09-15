import { Index } from 'flexsearch';

import { encodeSearchText, FLEXSEARCH_MIN_TERM_LENGTH, foldSearchText } from '@wcpos/sync-core';
import {
	SEARCH_FIXTURE_PRODUCTS,
	SEARCH_FIXTURE_TRAPS,
	searchFixtureBlob,
} from '@wcpos/sync-core/testing';

// Mirrors createSearchInstance's indexOptions (see search.test.ts 'tokenizer behaviour').
function buildIndex() {
	// The same shape search.test.ts uses: a const object, not an inline literal, because
	// flexsearch's IndexOptions type does not declare `minlength` although the runtime reads it.
	const indexOptions = {
		preset: 'performance',
		tokenize: 'full',
		minlength: FLEXSEARCH_MIN_TERM_LENGTH,
		encode: encodeSearchText,
	} as const;
	const index = new Index(indexOptions);
	for (const p of SEARCH_FIXTURE_PRODUCTS) index.add(p.id, searchFixtureBlob(p));
	return index;
}

describe('FlexSearch phrase candidate completeness against the fixture traps', () => {
	const index = buildIndex();
	it.each(SEARCH_FIXTURE_TRAPS.map((t) => [t.name, t] as const))('%s', (_name, trap) => {
		// Independent candidate probe; final per-field phrase selection belongs to query tests.
		const anchor = (foldSearchText(trap.query).match(/[\p{L}\p{N}]+/gu) ?? [])
			.filter((term) => term.length >= FLEXSEARCH_MIN_TERM_LENGTH)
			.sort((a, b) => b.length - a.length)[0];
		if (!anchor) return; // Deliberate scan, not an index query.
		const ids = index.search(anchor, { limit: Number.MAX_SAFE_INTEGER });
		for (const id of trap.expectedIds) expect(ids).toContain(id);
	});
});
