import { BehaviorSubject } from 'rxjs';

import { observeOrderLinkStates } from '../src/mutations';
import { residentEngine } from './helpers/resident-engine';

const row = (status = 'pos-open', customer_id = 0, dirty = false) => ({
	toJSON: () => ({ uuid: 'order', payload: { status, customer_id }, local: { dirty } }),
});

it('projects status, customer and unsent state, suppressing only equal keys within a binding', () => {
	const rows = new BehaviorSubject([row()]);
	const find = jest.fn(() => ({ $: rows }));
	const { engine, databases } = residentEngine({ collections: { orders: { find } } });
	const seen: string[] = [];
	const sub = observeOrderLinkStates(engine, ['order']).subscribe((key) => seen.push(key));
	expect(find).toHaveBeenCalledWith({ selector: { uuid: { $in: ['order'] } } });
	rows.next([row()]);
	rows.next([row('completed')]);
	rows.next([row('completed', 42)]);
	rows.next([row('completed', 42, true)]);
	expect(seen).toEqual([
		'order:pos-open:0:false',
		'order:completed:0:false',
		'order:completed:42:false',
		'order:completed:42:true',
	]);
	const replacement = new BehaviorSubject([row('completed', 42, true)]);
	databases.next({ collections: { orders: { find: () => ({ $: replacement }) } } });
	expect(seen).toHaveLength(5);
	expect(seen[4]).toBe('order:completed:42:true');
	rows.next([row('trash')]);
	expect(seen).toHaveLength(5);
	sub.unsubscribe();
});

it('emits nothing while the database, collection or linked ids are absent', () => {
	const { engine, databases } = residentEngine();
	const seen: string[] = [];
	const sub = observeOrderLinkStates(engine, ['order']).subscribe((key) => seen.push(key));
	databases.next({ collections: {} });
	const rows = new BehaviorSubject([row()]);
	databases.next({ collections: { orders: { find: () => ({ $: rows }) } } });
	expect(seen).toEqual(['order:pos-open:0:false']);
	databases.next(null);
	rows.next([row('trash')]);
	expect(seen).toEqual(['order:pos-open:0:false']);
	const empty = observeOrderLinkStates(engine, []).subscribe((key) => seen.push(key));
	databases.next({ collections: { orders: { find: () => ({ $: rows }) } } });
	expect(seen).toEqual(['order:pos-open:0:false', 'order:trash:0:false']);
	empty.unsubscribe();
	sub.unsubscribe();
});
