import { firstValueFrom, Subject } from 'rxjs';
import { skip, take, toArray } from 'rxjs/operators';

import { createSelectedCategoryOptions$ } from './selected-categories';

describe('createSelectedCategoryOptions$', () => {
	it('pulls a selected category that is missing locally and emits its name after upsert', async () => {
		const category$ = new Subject<null | { id: number; name: string }>();
		const collection = {
			findOne: jest.fn(() => ({ $: category$ })),
		};
		const pullDocument = jest.fn(async () => {
			category$.next({ id: 38, name: 'Hardware' });
		});

		const selected$ = createSelectedCategoryOptions$({
			ids: [38],
			collection: collection as any,
			pullDocument,
			loadingLabel: 'Loading...',
		});
		const emissionsPromise = firstValueFrom(selected$.pipe(take(2), toArray()));

		category$.next(null);

		await expect(emissionsPromise).resolves.toEqual([
			[{ value: '38', label: 'Loading...' }],
			[{ value: '38', label: 'Hardware' }],
		]);
		expect(pullDocument).toHaveBeenCalledWith(38, collection);
	});

	it('does not use the raw id as the missing-category label while a pull is pending', async () => {
		const category$ = new Subject<null>();
		const collection = {
			findOne: jest.fn(() => ({ $: category$ })),
		};
		const pullDocument = jest.fn(async () => undefined);

		const selected$ = createSelectedCategoryOptions$({
			ids: [38],
			collection: collection as any,
			pullDocument,
			loadingLabel: 'Loading...',
		});
		const emissionPromise = firstValueFrom(selected$.pipe(skip(0), take(1)));

		category$.next(null);

		await expect(emissionPromise).resolves.toEqual([{ value: '38', label: 'Loading...' }]);
	});

	it('does not surface an unhandled rejection when a missing-category pull fails', async () => {
		const category$ = new Subject<null>();
		const collection = {
			findOne: jest.fn(() => ({ $: category$ })),
		};
		const pullDocument = jest.fn(async () => {
			throw new Error('network failed');
		});
		const unhandled = jest.fn();
		process.once('unhandledRejection', unhandled);

		const selected$ = createSelectedCategoryOptions$({
			ids: [38],
			collection: collection as any,
			pullDocument,
			loadingLabel: 'Loading...',
		});
		const subscription = selected$.subscribe();

		category$.next(null);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(unhandled).not.toHaveBeenCalled();
		subscription.unsubscribe();
		process.removeListener('unhandledRejection', unhandled);
	});
});
