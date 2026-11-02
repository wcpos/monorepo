import { Observable, of, type Subscriber, throwError } from 'rxjs';

import { observeResidentRead } from '../src/resident-read';
import { residentEngine } from './helpers/resident-engine';

it('emits absent before subscribing, keeps duplicate answers, and survives inner completion', () => {
	const database = { collections: { orders: {} } };
	const { engine, databases } = residentEngine(database);
	const seen: string[] = [];
	const read = jest.fn(() => {
		expect(seen.at(-1)).toBe('absent');
		return of('answer', 'answer');
	});
	const complete = jest.fn();
	const sub = observeResidentRead(engine, {
		collections: ['orders'],
		absent: 'absent',
		read,
	}).subscribe({ next: (value) => seen.push(value), complete });
	expect(seen).toEqual(['absent', 'answer', 'answer']);
	databases.next(database);
	expect(read).toHaveBeenCalledTimes(1);
	databases.next(null);
	expect(seen).toEqual(['absent', 'answer', 'answer', 'absent']);
	expect(complete).not.toHaveBeenCalled();
	sub.unsubscribe();
	expect(databases.observed).toBe(false);
});

it('rebinds on database and collection identity changes and ignores late superseded reads', () => {
	const { engine, databases } = residentEngine();
	const seen: string[] = [];
	const readers: Subscriber<string>[] = [];
	const teardown = jest.fn();
	const sub = observeResidentRead(engine, {
		collections: ['orders'],
		absent: 'absent',
		read: () =>
			new Observable<string>((subscriber) => {
				readers.push(subscriber);
				return teardown;
			}),
	}).subscribe((value) => seen.push(value));
	expect(seen).toEqual(['absent']);
	const first = { collections: { orders: {} } };
	databases.next(first);
	readers[0].next('first');
	const second = { collections: first.collections };
	databases.next(second);
	readers[0].next('late');
	readers[1].next('second');
	second.collections.orders = {};
	databases.next(second);
	readers[1].next('late reset');
	readers[2].next('reset');
	databases.next(null);
	readers[2].next('late null');
	expect(seen).toEqual([
		'absent',
		'absent',
		'first',
		'absent',
		'second',
		'absent',
		'reset',
		'absent',
	]);
	expect(teardown).toHaveBeenCalledTimes(3);
	sub.unsubscribe();
});

it('propagates read errors without recovery', () => {
	const { engine } = residentEngine({ collections: { orders: {} } });
	const failure = new Error('read failed');
	const error = jest.fn();
	observeResidentRead(engine, {
		collections: ['orders'],
		absent: [],
		read: () => throwError(() => failure),
	}).subscribe({ error });
	expect(error).toHaveBeenCalledWith(failure);
});
