import { BehaviorSubject } from 'rxjs';

import type { QueueRow } from '@wcpos/sync-engine';

import { observeQueueCounts, observeQueueRows } from '../src/reads/queue-rows';
import { residentEngine } from './helpers/resident-engine';

function fixture() {
	const orders = new BehaviorSubject([{ uuid: 'cart' }]);
	const { engine, databases } = residentEngine({
		collections: { orders: { find: () => ({ $: orders }) } },
	});
	const rows = new BehaviorSubject<readonly QueueRow[] | null>(null);
	engine.queueRows$ = (next, error) => {
		const sub = rows.subscribe({ next, error });
		return () => sub.unsubscribe();
	};
	return { engine, rows, orders, databases };
}
function row(mutationId: string, overrides: Partial<QueueRow> = {}): QueueRow {
	return {
		mutationId,
		recordId: mutationId,
		collectionName: 'products',
		operation: 'update',
		payload: {},
		queuedAt: '',
		status: 'pending',
		...overrides,
	};
}

it('filters one live queue by status and collection, emits empty when absent, and forwards faults', () => {
	const { engine, rows } = fixture();
	const seen: unknown[] = [];
	const error = jest.fn();
	const sub = observeQueueRows(engine, {
		statuses: ['rejected'],
		collectionName: 'orders',
	}).subscribe({ next: (value) => seen.push(value), error });
	expect(seen).toEqual([[]]);
	const rejected = row('sale', { status: 'rejected', collectionName: 'orders' });
	rows.next([row('pending'), row('product', { status: 'rejected' }), rejected]);
	expect(seen.at(-1)).toEqual([rejected]);
	rows.next(null);
	expect(seen.at(-1)).toEqual([]);
	const failure = new Error('storage');
	rows.error(failure);
	expect(error).toHaveBeenCalledWith(failure);
	sub.unsubscribe();
	expect(rows.observed).toBe(false);
});

it('excludes held carts, counts distinct sales and partitions terminal decisions', () => {
	const { engine, rows, orders } = fixture();
	let counts: unknown;
	const sub = observeQueueCounts(engine).subscribe((value) => {
		counts = value;
	});
	rows.next([
		row('cart', { collectionName: 'orders' }),
		row('A', { collectionName: 'orders' }),
		row('A2', { collectionName: 'orders', recordId: 'A', status: 'claimed' }),
		row('product'),
		row('rejected', { status: 'rejected' }),
		row('conflict', { status: 'conflicted' }),
		row('revision', { status: 'needs-revision' }),
	]);
	expect(counts).toEqual({
		syncBacklog: 3,
		syncBacklogSales: 1,
		needsDecision: 3,
		needsDecisionRejected: 1,
		needsDecisionUnresolved: 2,
	});
	orders.next([]);
	expect(counts).toMatchObject({ syncBacklog: 4, syncBacklogSales: 2 });
	sub.unsubscribe();
});

it('rebinds held-cart membership after a same-database collection reset', () => {
	const { engine, rows, orders, databases } = fixture();
	let backlog = -1;
	const sub = observeQueueCounts(engine).subscribe((value) => {
		backlog = value.syncBacklog;
	});
	rows.next([row('cart', { collectionName: 'orders' })]);
	expect(backlog).toBe(0);
	const replacement = new BehaviorSubject<{ uuid: string }[]>([]);
	const database = databases.value as { collections: { orders: unknown } };
	database.collections.orders = { find: () => ({ $: replacement }) };
	databases.next(database);
	expect(backlog).toBe(1);
	orders.next([{ uuid: 'cart' }]);
	expect(backlog).toBe(1);
	sub.unsubscribe();
	expect(replacement.observed).toBe(false);
});
