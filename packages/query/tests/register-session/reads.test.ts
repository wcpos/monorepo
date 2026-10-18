import { BehaviorSubject, Subject } from 'rxjs';

import {
	observeCashMovements,
	observeRegisterClosures,
	observeRegisterSessions,
} from '../../src/register-session/reads';

// A replacement must clear the old rows before its delayed first answer, and late old answers
// must not reach the cashier. Dropping switchMap/startWith or the owner guard breaks this test.
it('follows only this store’s session replacements and invalidates the old generation', () => {
	const reset$ = new Subject<never>();
	const active = new BehaviorSubject([{ id: 'old' }]);
	const closed = new BehaviorSubject([]);
	const first = {
		find: jest.fn(({ selector }) => ({ $: selector.status === 'closed' ? closed : active })),
	};
	const db = { collections: { register_sessions: first }, reset$ };
	const values: unknown[] = [];
	const sub = observeRegisterSessions(db, 'register').subscribe((value) => values.push(value));
	expect(values[0]).toBeNull();
	const old = values.at(-1) as { isCurrent: () => boolean };
	expect(old).toMatchObject({ active: [{ id: 'old' }], closed: [] });
	expect(old.isCurrent()).toBe(true);
	expect(first.find.mock.calls).toEqual([
		[{ selector: { register_id: 'register', status: { $in: ['open', 'counting'] } } }],
		[{ selector: { register_id: 'register', status: 'closed' } }],
	]);
	const incoming = new Subject<never[]>();
	const next = { name: 'register_sessions', database: db, find: jest.fn(() => ({ $: incoming })) };
	reset$.next({ ...next, database: {} } as never);
	expect(values.at(-1)).toBe(old);
	db.collections.register_sessions = next;
	reset$.next(next as never);
	expect(old.isCurrent()).toBe(false);
	expect(values.at(-1)).toBeNull();
	active.next([{ id: 'late' }]);
	expect(values.at(-1)).toBeNull();
	incoming.next([]);
	expect(values.at(-1)).toMatchObject({ active: [], closed: [] });
	sub.unsubscribe();
});

it('keeps movements unscoped, scopes closures, and declares null absence for all three reads', () => {
	for (const read of [observeRegisterSessions, observeCashMovements, observeRegisterClosures]) {
		const values: unknown[] = [];
		read(null, 'register').subscribe((value) => values.push(value));
		expect(values).toEqual([null]);
	}
	const rows = new BehaviorSubject([{ id: 'row' }]);
	const find = jest.fn(() => ({ $: rows }));
	const db = { collections: { cash_movements: { find }, closures: { find } } };
	const movements: unknown[] = [],
		closures: unknown[] = [];
	const a = observeCashMovements(db).subscribe((value) => movements.push(value));
	const b = observeRegisterClosures(db, 'register').subscribe((value) => closures.push(value));
	expect(find.mock.calls).toEqual([[], [{ selector: { register_id: 'register' } }]]);
	expect(movements).toEqual([null, [{ id: 'row' }]]);
	expect(closures).toEqual([null, [{ id: 'row' }]]);
	a.unsubscribe();
	b.unsubscribe();
});
