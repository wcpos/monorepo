/**
 * A query handle for tests: the handle's reader contract (`value`, `subscribe`, `observe`,
 * `retain`, `sync`, `whenReady`, `retry`, `whenAnswered`) over one snapshot a test drives with
 * `set(partial)`. `set({ result })` recomputes `hits` and `count`; `set({ ready: false })` is a
 * cold handle. Readers see every field change through `subscribe`, as with the real handle.
 */
const { Observable } = require('rxjs');

function snapshotFrom(previous, partial) {
	const next = { ...previous, ...partial };
	if (partial.result) {
		next.hits = partial.result.hits;
		next.count = partial.result.count ?? partial.result.hits.length;
		next.searchActive = Boolean(partial.result.searchActive);
		next.searchState = partial.result.searchState;
	}
	return next;
}

function fakeQueryHandle(initial = {}, key = 'fake') {
	const listeners = new Set();
	let value = snapshotFrom(
		{
			ready: true,
			error: null,
			result: { hits: [], count: 0 },
			hits: [],
			count: 0,
			searchActive: false,
			searchState: undefined,
			active: false,
			pending: false,
			exhausted: null,
			total: null,
			laneProgress: null,
		},
		initial
	);
	const notify = () => {
		for (const listener of [...listeners]) listener();
	};
	const handle = {
		key,
		get value() {
			return value;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		retain() {
			handle.retained += 1;
			return () => {
				handle.retained -= 1;
			};
		},
		retained: 0,
		observe() {
			return new Observable((subscriber) => {
				subscriber.next(value);
				const listener = () => subscriber.next(value);
				listeners.add(listener);
				return () => listeners.delete(listener);
			});
		},
		sync: jest.fn(async () => undefined),
		whenReady: async () => ({ attempted: true, fetched: false }),
		retry: jest.fn(),
		whenAnswered: () => (value.ready ? Promise.resolve() : new Promise(() => undefined)),
		/** Drive the snapshot. */
		set(partial) {
			value = snapshotFrom(value, partial);
			notify();
		},
	};
	return handle;
}

module.exports = { fakeQueryHandle };
