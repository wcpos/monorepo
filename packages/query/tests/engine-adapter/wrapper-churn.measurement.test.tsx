/**
 * @jest-environment jsdom
 *
 * MEASUREMENT — quantifies what the wrapper cache actually buys, end to end, against a REAL
 * RxDB database and the REAL `wrapEngineDocument`. Nothing here is mocked.
 *
 * The claim under #1245 is: a write to ONE row stops handing React new document identities
 * for the WHOLE result set. This measures exactly that, at two levels —
 *
 *   1. wrapper identity churn: how many of N wrappers change when one row is written
 *   2. React commits: how many memoised row components re-render for that same write
 *
 * It is deliberately NOT a frame-time benchmark. It measures the mechanism the PR changes;
 * what it costs in wall-clock on a real device still wants a profiler on hardware.
 */
import * as React from 'react';

import { render } from '@testing-library/react';
import { createRxDatabase, type RxDocument } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { firstValueFrom, skip } from 'rxjs';

import { wrapEngineDocument } from '../../src/engine-adapter/document-proxy';

import type { EngineDocument } from '../../src/engine-adapter/collection-map';

const ROW_COUNT = 50;

/** Engine-shaped: an id plus an opaque payload, which is what the adapter translates. */
const schema = {
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 64 },
		payload: { type: 'object', additionalProperties: true },
	},
	required: ['uuid'],
};

let dbCounter = 0;

async function makeOrders(count: number) {
	const db = await createRxDatabase({
		name: `churn${dbCounter++}`,
		storage: getRxStorageMemory(),
	});
	const { orders } = await db.addCollections({ orders: { schema: schema as never } });
	await orders.bulkInsert(
		Array.from({ length: count }, (_, i) => ({
			uuid: `order-${i}`,
			payload: { number: String(i), billing: { country: 'US' }, status: 'pos-open' },
		}))
	);
	return { db, orders };
}

function wrapAll(docs: RxDocument<EngineDocument>[]) {
	return docs.map((doc) => wrapEngineDocument('orders', doc));
}

describe('MEASUREMENT: wrapper churn for a single-row write', () => {
	it('reports how many of the result set change identity', async () => {
		const { db, orders } = await makeOrders(ROW_COUNT);
		const query = orders.find({ selector: {}, sort: [{ uuid: 'asc' }] });

		const first = (await firstValueFrom(query.$)) as RxDocument<EngineDocument>[];
		const before = wrapAll(first);

		const nextEmission = firstValueFrom(query.$.pipe(skip(1)));
		await orders
			.findOne('order-7')
			.exec()
			.then((doc) => doc!.incrementalPatch({ payload: { number: 'CHANGED' } }));
		const second = (await nextEmission) as RxDocument<EngineDocument>[];
		const after = wrapAll(second);

		const changed = after.filter((wrapper, i) => wrapper !== before[i]).length;

		// The whole point: only the row that actually changed.
		expect(changed).toBe(1);

		await db.close();
	});

	it('reports how many memoised row components React re-renders', async () => {
		const { db, orders } = await makeOrders(ROW_COUNT);
		const query = orders.find({ selector: {}, sort: [{ uuid: 'asc' }] });

		const onRowRender = jest.fn();

		/**
		 * Memoised on the wrapper, exactly as a row component keyed on its document would be.
		 * A stable wrapper therefore means React skips the row entirely.
		 */
		const Row = React.memo(function Row({ order }: { order: { number?: string } }) {
			onRowRender();
			return <span>{order.number}</span>;
		});

		function Table({ rows }: { rows: { number?: string }[] }) {
			return (
				<>
					{rows.map((order, i) => (
						<Row key={i} order={order} />
					))}
				</>
			);
		}

		const first = (await firstValueFrom(query.$)) as RxDocument<EngineDocument>[];
		const { rerender } = render(<Table rows={wrapAll(first) as { number?: string }[]} />);
		expect(onRowRender).toHaveBeenCalledTimes(ROW_COUNT);
		onRowRender.mockClear();

		const nextEmission = firstValueFrom(query.$.pipe(skip(1)));
		await orders
			.findOne('order-7')
			.exec()
			.then((doc) => doc!.incrementalPatch({ payload: { number: 'CHANGED' } }));
		const second = (await nextEmission) as RxDocument<EngineDocument>[];

		rerender(<Table rows={wrapAll(second) as { number?: string }[]} />);

		expect(onRowRender).toHaveBeenCalledTimes(1);

		await db.close();
	});
});
