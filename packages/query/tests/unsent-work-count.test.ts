import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';

import { observeUnsentWorkCount } from '../src/reads/unsent-work-count';
import { residentEngine } from './helpers/resident-engine';

it('subtracts internal rows, rebinds on queue replacement, and tears down', async () => {
	const all = new BehaviorSubject(5);
	const internal = new BehaviorSubject(2);
	const count = jest.fn((query?: unknown) => {
		const source = query ? internal : all;
		return { $: source, exec: async () => source.value };
	});
	const database = { collections: { recordMutations: { count } } };
	const { engine, databases } = residentEngine(database);
	const seen: (number | null)[] = [];
	const sub = observeUnsentWorkCount(engine).subscribe((value) => seen.push(value));
	expect(seen).toEqual([null, 3]);
	all.next(6);
	expect(seen.at(-1)).toBe(4);
	await expect(
		firstValueFrom(
			observeUnsentWorkCount(engine, { snapshot: true }).pipe(filter((value) => value !== null))
		)
	).resolves.toBe(4);
	expect(count.mock.calls).toEqual(
		expect.arrayContaining([[], [{ selector: { status: 'internal' } }]])
	);
	database.collections.recordMutations = {
		count: jest.fn(() => ({ $: new BehaviorSubject(0), exec: async () => 0 })),
	};
	databases.next(database);
	expect(seen.slice(-2)).toEqual([null, 0]);
	expect(all.observed).toBe(false);
	databases.next(null);
	expect(seen.at(-1)).toBeNull();
	sub.unsubscribe();
	expect(databases.observed).toBe(false);
});
