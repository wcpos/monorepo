import { BehaviorSubject, Subject } from 'rxjs';

import * as query from '../src';

import type { LocalCollectionReset } from '../src/use-local-collection';

it('clears on every binding, projects plain rows, and follows only its own reset', () => {
	const before = { id: 'before' };
	const after = { id: 'after' };
	const oldRows$ = new BehaviorSubject([{ toJSON: () => before }]);
	const newRows$ = new Subject<{ toJSON: () => typeof after }[]>();
	const find = jest.fn(() => ({ $: oldRows$ }));
	const replacementFind = jest.fn(() => ({ $: newRows$ }));
	const reset$ = new Subject<LocalCollectionReset>();
	const database = { collections: { notifications: { find } }, reset$ };
	const seen: unknown[] = [];
	const sub = query
		.observeNotifications(database, 'subscriber')
		.subscribe((rows) => seen.push(rows));
	expect(seen).toEqual([[], [before]]);
	reset$.next({ name: 'notifications', database: {} });
	reset$.next({ name: 'logs', database });
	expect(seen).toHaveLength(2);
	reset$.next({ name: 'notifications', database, find: replacementFind });
	expect(seen).toEqual([[], [before], []]);
	newRows$.next([{ toJSON: () => after }]);
	expect(seen).toEqual([[], [before], [], [after]]);
	for (const fn of [find, replacementFind])
		expect(fn).toHaveBeenCalledWith({
			selector: { subscriberId: 'subscriber' },
			sort: [{ createdAt: 'desc' }],
		});
	oldRows$.next([]);
	expect(seen).toHaveLength(4);
	sub.unsubscribe();
});

it('emits [] for absent databases and a null subscriber without querying', () => {
	const find = jest.fn();
	for (const [database, subscriber] of [
		[null, 's'],
		[undefined, 's'],
		[{ collections: { notifications: { find } } }, null],
	] as const) {
		const seen: unknown[] = [];
		query
			.observeNotifications(database, subscriber)
			.subscribe((rows) => seen.push(rows))
			.unsubscribe();
		expect(seen).toEqual([[]]);
	}
	expect(find).not.toHaveBeenCalled();
});

it('announces only this database’s notification replacements, never the initial binding', () => {
	const reset$ = new Subject<LocalCollectionReset>();
	const database = { collections: {}, reset$ };
	const seen: unknown[] = [];
	const sub = query.observeNotificationsReplaced(database).subscribe((value) => seen.push(value));
	expect(seen).toEqual([]);
	reset$.next({ name: 'notifications', database: {} });
	reset$.next({ name: 'logs', database });
	expect(seen).toEqual([]);
	reset$.next({ name: 'notifications', database });
	reset$.next({ name: 'notifications', database });
	expect(seen).toEqual([undefined, undefined]);
	sub.unsubscribe();
});
