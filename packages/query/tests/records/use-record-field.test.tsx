/**
 * @jest-environment jsdom
 *
 * The field-reactivity idiom's contract, against a REAL RxDB database (nothing mocked):
 *
 *   1. synchronous first value — no loading flash;
 *   2. re-renders when the selected slice changes;
 *   3. does NOT re-render when an unselected field changes (deepEqual dedupe);
 *   4. inline selectors + re-renders never resubscribe the document stream — the
 *      subscription is torn down only on source identity change;
 *   5. the LATEST selector applies (a changed selector is not frozen at first render);
 *   6. RxState-like sources (sync-less `$`) still deliver a synchronous first value.
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { createRxDatabase, type RxCollection, type RxDatabase, type RxDocument } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { useDocField, useRecordField } from '../../src/records/use-record-field';

type Shape = {
	uuid: string;
	remoteId: string | null;
	payload: { total?: string; note?: string; nested?: { qty: number } };
};

const schema = {
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 64 },
		remoteId: { type: ['string', 'null'], maxLength: 64 },
		payload: { type: 'object', additionalProperties: true },
	},
	required: ['uuid'],
} as const;

let database: RxDatabase;
let collection: RxCollection<Shape>;
let databaseIndex = 0;

beforeEach(async () => {
	database = await createRxDatabase({
		name: `record-field-test-${databaseIndex++}`,
		storage: getRxStorageMemory(),
	});
	const collections = await database.addCollections({ rows: { schema } });
	collection = collections.rows as RxCollection<Shape>;
});

afterEach(async () => {
	await database.close();
});

async function insertRow(uuid = 'row-1'): Promise<RxDocument<Shape>> {
	return collection.insert({
		uuid,
		remoteId: null,
		payload: { total: '10.00', note: 'first', nested: { qty: 1 } },
	});
}

async function writePayload(
	document: RxDocument<Shape>,
	patch: Partial<Shape['payload']>
): Promise<void> {
	await act(async () => {
		await document.getLatest().incrementalModify((data) => ({
			...data,
			payload: { ...data.payload, ...patch },
		}));
		// let the collection event fan out to subscribers
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

/**
 * Wrap the collection's event stream so document subscriptions are countable: every
 * `doc.$` subscription reaches `eventBulks$` exactly once (verified rxdb 17.4.0 —
 * `rx-document.ts` builds the per-document stream from `collection.eventBulks$`).
 */
function countEventStreamSubscriptions(target: RxCollection<Shape>): { count: () => number } {
	const original = target.eventBulks$;
	let subscriptions = 0;
	Object.defineProperty(target, 'eventBulks$', {
		configurable: true,
		get() {
			return new Observable((subscriber) => {
				subscriptions += 1;
				return original.subscribe(subscriber);
			});
		},
	});
	return { count: () => subscriptions };
}

describe('useRecordField', () => {
	it('delivers the current value synchronously on first render', async () => {
		const document = await insertRow();
		const seen: (string | undefined)[] = [];

		function Probe({ record }: { record: RxDocument<Shape> }) {
			const total = useRecordField(record, (row) => row.payload.total);
			seen.push(total);
			return <>{total}</>;
		}

		render(<Probe record={document} />);
		expect(seen[0]).toBe('10.00');
	});

	it('re-renders for a selected-field change and dedupes unselected-field writes', async () => {
		const document = await insertRow();
		const renders = jest.fn();

		function Probe({ record }: { record: RxDocument<Shape> }) {
			const total = useRecordField(record, (row) => row.payload.total);
			renders(total);
			return <>{total}</>;
		}

		render(<Probe record={document} />);
		const after_mount = renders.mock.calls.length;

		await writePayload(document, { note: 'changed' }); // unselected field
		expect(renders.mock.calls.length).toBe(after_mount);

		await writePayload(document, { total: '25.00' }); // selected field
		expect(renders.mock.calls.length).toBeGreaterThan(after_mount);
		expect(renders.mock.calls.at(-1)?.[0]).toBe('25.00');
	});

	it('dedupes deep-equal object slices across document revisions', async () => {
		const document = await insertRow();
		const renders = jest.fn();

		function Probe({ record }: { record: RxDocument<Shape> }) {
			// An OBJECT slice: new revision ⇒ new object reference, deepEqual must absorb it.
			const nested = useRecordField(record, (row) => row.payload.nested);
			renders(nested);
			return <>{nested?.qty}</>;
		}

		render(<Probe record={document} />);
		const after_mount = renders.mock.calls.length;

		await writePayload(document, { note: 'revision only' });
		expect(renders.mock.calls.length).toBe(after_mount);
	});

	it('never resubscribes for re-renders with inline selectors; resubscribes on record swap', async () => {
		const first = await insertRow('row-a');
		const second = await insertRow('row-b');
		const counter = countEventStreamSubscriptions(collection);

		function Probe({ record }: { record: RxDocument<Shape> }) {
			// Deliberately inline — a fresh function identity every render.
			const total = useRecordField(record, (row) => row.payload.total);
			return <>{total}</>;
		}

		const { rerender } = render(<Probe record={first} />);
		const after_mount = counter.count();
		expect(after_mount).toBeGreaterThan(0);

		for (let i = 0; i < 25; i++) {
			rerender(<Probe record={first} />);
		}
		expect(counter.count()).toBe(after_mount); // 25 re-renders, zero resubscriptions

		rerender(<Probe record={second} />);
		expect(counter.count()).toBe(after_mount + 1); // identity change: exactly one
	});

	it('applies the latest selector without resubscribing', async () => {
		const document = await insertRow();
		const counter = countEventStreamSubscriptions(collection);

		function Probe({ record, field }: { record: RxDocument<Shape>; field: 'total' | 'note' }) {
			const value = useRecordField(record, (row) => row.payload[field]);
			return <>{value}</>;
		}

		const { rerender, container } = render(<Probe record={document} field="total" />);
		const after_mount = counter.count();
		expect(container.textContent).toBe('10.00');

		rerender(<Probe record={document} field="note" />);
		expect(counter.count()).toBe(after_mount);

		// The new selector governs the next evaluation.
		await writePayload(document, { note: 'second' });
		expect(container.textContent).toBe('second');
	});

	it('yields undefined for a nullish record and recovers when one arrives', async () => {
		const document = await insertRow();

		function Probe({ record }: { record: RxDocument<Shape> | null }) {
			const total = useRecordField(record, (row) => row.payload.total);
			return <>{total ?? 'none'}</>;
		}

		const { rerender, container } = render(<Probe record={null} />);
		expect(container.textContent).toBe('none');

		rerender(<Probe record={document} />);
		expect(container.textContent).toBe('10.00');
	});
});

describe('useDocField (RxState-like sources)', () => {
	it('seeds a synchronous first value from get() when $ does not replay', () => {
		const changes = new Subject<{ theme: string }>();
		const state = { $: changes.asObservable(), get: () => ({ theme: 'light' }) };

		function Probe() {
			const theme = useDocField(state, (s) => s.theme);
			return <>{theme}</>;
		}

		const { container } = render(<Probe />);
		expect(container.textContent).toBe('light');

		act(() => changes.next({ theme: 'dark' }));
		expect(container.textContent).toBe('dark');
	});

	it('accepts BehaviorSubject-backed state and dedupes equal emissions', () => {
		const subject = new BehaviorSubject({ decimals: 2 });
		const state = { $: subject.asObservable(), get: () => subject.getValue() };
		const renders = jest.fn();

		function Probe() {
			const decimals = useDocField(state, (s) => s.decimals);
			renders(decimals);
			return <>{decimals}</>;
		}

		render(<Probe />);
		const after_mount = renders.mock.calls.length;

		act(() => subject.next({ decimals: 2 })); // deep-equal emission
		expect(renders.mock.calls.length).toBe(after_mount);

		act(() => subject.next({ decimals: 4 }));
		expect(renders.mock.calls.at(-1)?.[0]).toBe(4);
	});
});
