import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';

import { observeUnsentWorkCount } from '../src/reads/unsent-work-count';
import { residentEngine } from './helpers/resident-engine';

it('subtracts internal rows, rebinds on queue replacement, and tears down', async () => {
	const all = new BehaviorSubject(5);
	const rows = new BehaviorSubject([
		{ status: 'pending' },
		{},
		{},
		{ status: 'internal' },
		{ status: 'internal' },
	]);
	const find = jest.fn(() => ({ $: rows, exec: async () => rows.value }));
	const internal = new BehaviorSubject(2);
	const count = jest.fn((query?: unknown) => {
		const source = query ? internal : all;
		return { $: source, exec: async () => source.value };
	});
	const database = { collections: { recordMutations: { count, find } } };
	const { engine, databases } = residentEngine(database);
	const seen: (number | null)[] = [];
	const sub = observeUnsentWorkCount(engine).subscribe((value) => seen.push(value));
	expect(seen).toEqual([null, 3]);
	rows.next([...rows.value, {}]);
	all.next(6);
	expect(seen.at(-1)).toBe(4);
	await expect(
		firstValueFrom(
			observeUnsentWorkCount(engine, { snapshot: true }).pipe(filter((value) => value !== null))
		)
	).resolves.toBe(4);
	expect(count).not.toHaveBeenCalled();
	database.collections.recordMutations = {
		count: jest.fn(() => ({ $: new BehaviorSubject(0), exec: async () => 0 })),
		find: jest.fn(() => ({ $: new BehaviorSubject([]), exec: async () => [] })),
	};
	databases.next(database);
	expect(seen.slice(-2)).toEqual([null, 0]);
	expect(all.observed).toBe(false);
	databases.next(null);
	expect(seen.at(-1)).toBeNull();
	sub.unsubscribe();
	expect(databases.observed).toBe(false);
});

it('does not report zero from counts straddling an append', async () => {
	const rows = [{ status: 'pending' }, { status: 'internal' }];
	const { engine } = residentEngine({
		collections: {
			recordMutations: {
				find: () => ({ exec: async () => rows, $: new BehaviorSubject(rows) }),
				// The old all-count ran before the append; internal-count ran after it.
				count: () => ({ exec: async () => 1, $: new BehaviorSubject(1) }),
			},
		},
	});
	await expect(
		firstValueFrom(
			observeUnsentWorkCount(engine, { snapshot: true }).pipe(filter((value) => value !== null))
		)
	).resolves.toBe(1);
});
