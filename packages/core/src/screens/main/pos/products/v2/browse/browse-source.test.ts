import {
	BROWSE_BY,
	collectionFor,
	isHierarchical,
	isTaxonomy,
	readBrowseBy,
	termKey,
} from './browse-source';

it('reads an unknown or missing value as all', () => {
	expect(readBrowseBy(undefined)).toBe('all');
	expect(readBrowseBy('favourites')).toBe('all');
	for (const value of BROWSE_BY) expect(readBrowseBy(value)).toBe(value);
});

it('knows which sources are taxonomies and which nest', () => {
	expect(isTaxonomy('all')).toBe(false);
	expect(isTaxonomy('shortcuts')).toBe(false);
	expect(isTaxonomy('tags')).toBe(true);
	expect(isHierarchical('categories')).toBe(true);
	expect(isHierarchical('brands')).toBe(true);
	expect(isHierarchical('tags')).toBe(false);
	expect(collectionFor('brands')).toBe('products/brands');
});

it('keys every kind of term distinctly', () => {
	expect(termKey({ kind: 'all' })).toBe('all');
	expect(termKey({ kind: 'term', id: 7, name: 'x', count: 1 })).toBe('term-7');
	expect(termKey({ kind: 'shortcut', id: 'qf1', name: 'x', description: '' })).toBe('shortcut-qf1');
});
