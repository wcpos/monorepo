import { diffHits, diffProps } from './render-probe';

describe('render-probe diff helpers', () => {
	it('reports a first render as a mount', () => {
		expect(diffProps(null, { a: 1 })).toEqual(['mount']);
	});

	it('names the props whose identity changed, or "parent" when none did', () => {
		const record = { uuid: 'p1' };
		expect(diffProps({ record, count: 0 }, { record, count: 0 })).toEqual(['parent']);
		expect(diffProps({ record, count: 0 }, { record: { uuid: 'p1' }, count: 1 })).toEqual([
			'record',
			'count',
		]);
	});

	it('diffs two result emissions by id: additions, removals, moves, identity and image src', () => {
		const a = { id: 'a', record: { payload: { images: [{ src: 'a.jpg' }] } } };
		const b = { id: 'b', record: { payload: { images: [{ src: 'b.jpg' }] } } };
		const c = { id: 'c', record: { payload: { images: [] } } };
		expect(diffHits(null, [a, b])).toEqual({
			count: 2,
			added: 2,
			removed: 0,
			moved: 0,
			recordIdentityChanged: 0,
			imageSrcChanged: 0,
			rewrittenFields: {},
			rewrittenSample: [],
		});
		// Same documents, same order, same instances: a quiet emission.
		expect(diffHits([a, b], [a, b])).toEqual({
			count: 2,
			added: 0,
			removed: 0,
			moved: 0,
			recordIdentityChanged: 0,
			imageSrcChanged: 0,
			rewrittenFields: {},
			rewrittenSample: [],
		});
		// `a` re-materialised with a new image, `b` dropped, `c` inserted ahead.
		const a2 = { id: 'a', record: { payload: { images: [{ src: 'a2.jpg' }] } } };
		expect(diffHits([a, b], [c, a2])).toEqual({
			count: 2,
			added: 1,
			removed: 1,
			moved: 1,
			recordIdentityChanged: 1,
			imageSrcChanged: 1,
			// Plain fixtures carry no `toJSON`, so the rewrite reads as identical.
			rewrittenFields: { '(identical JSON)': 1 },
			rewrittenSample: ['a'],
		});
	});

	it('names the fields a rewritten record differs in, ignoring revision metadata', () => {
		const before = {
			id: 'a',
			record: {
				payload: { images: [], price: '1' },
				toJSON: () => ({ _rev: '1-a', payload: { images: [], price: '1' }, sortName: 'a' }),
			},
		};
		const after = {
			id: 'a',
			record: {
				payload: { images: [], price: '2' },
				toJSON: () => ({ _rev: '2-a', payload: { images: [], price: '2' }, sortName: 'b' }),
			},
		};
		expect(diffHits([before], [after]).rewrittenFields).toEqual({
			'payload.price': 1,
			sortName: 1,
		});
		const same = {
			id: 'a',
			record: { payload: {}, toJSON: () => ({ _rev: '3-a', payload: {} }) },
		};
		expect(diffHits([before], [same]).rewrittenFields).toEqual({
			'payload.images': 1,
			'payload.price': 1,
			sortName: 1,
		});
		const identical = { id: 'a', record: { ...same.record } };
		expect(diffHits([same], [identical]).rewrittenFields).toEqual({ '(identical JSON)': 1 });
	});
});
